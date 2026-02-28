// Servicio de Autenticación - Lógica de negocio
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../../config/database';
import { env } from '../../config/env';
import { sendPasswordResetEmail, sendVerificationEmail } from '../../config/email';

// ============================================
// RATE LIMITING (in-memory)
// ============================================

const loginAttempts = new Map<string, { count: number; lastAttempt: number }>();
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

// Cleanup expired entries every 15 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of loginAttempts) {
    if (now - value.lastAttempt > RATE_LIMIT_WINDOW_MS) {
      loginAttempts.delete(key);
    }
  }
}, RATE_LIMIT_WINDOW_MS);

function checkRateLimit(email: string): { allowed: boolean; minutesLeft?: number } {
  const key = email.toLowerCase();
  const entry = loginAttempts.get(key);
  if (!entry) return { allowed: true };

  const elapsed = Date.now() - entry.lastAttempt;
  if (elapsed > RATE_LIMIT_WINDOW_MS) {
    loginAttempts.delete(key);
    return { allowed: true };
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    const minutesLeft = Math.ceil((RATE_LIMIT_WINDOW_MS - elapsed) / 60000);
    return { allowed: false, minutesLeft };
  }

  return { allowed: true };
}

function recordFailedLogin(email: string): void {
  const key = email.toLowerCase();
  const entry = loginAttempts.get(key);
  if (entry) {
    entry.count++;
    entry.lastAttempt = Date.now();
  } else {
    loginAttempts.set(key, { count: 1, lastAttempt: Date.now() });
  }
}

function resetLoginAttempts(email: string): void {
  loginAttempts.delete(email.toLowerCase());
}

// ============================================
// FRONTEND URL
// ============================================

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://hoja-respuesta.vercel.app';

// ============================================
// TYPES
// ============================================

export interface RegisterData {
  email: string;
  password: string;
  name: string;
}

export interface LoginData {
  email: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  teacher: {
    id: string;
    email: string;
    name: string;
    is_verified: boolean;
  };
}

// ============================================
// AUTH SERVICE
// ============================================

export class AuthService {

  /**
   * Registrar un nuevo profesor
   */
  async register(data: RegisterData): Promise<AuthResponse> {
    const { email, password, name } = data;

    const existingTeacher = await prisma.teacher.findUnique({
      where: { email },
    });

    if (existingTeacher) {
      throw new Error('El email ya está registrado');
    }

    const password_hash = await bcrypt.hash(password, 10);
    const verification_token = crypto.randomUUID();

    const teacher = await prisma.teacher.create({
      data: {
        email,
        password_hash,
        name,
        is_verified: false,
        verification_token,
      },
    });

    // Send verification email (non-blocking)
    const verifyUrl = `${FRONTEND_URL}/verify-email?token=${verification_token}`;
    sendVerificationEmail(email, name, verifyUrl).catch(err => {
      console.error('Failed to send verification email:', err);
    });

    const token = this.generateToken(teacher.id);

    return {
      token,
      teacher: {
        id: teacher.id,
        email: teacher.email,
        name: teacher.name,
        is_verified: teacher.is_verified,
      },
    };
  }

  /**
   * Login de profesor (con rate limiting)
   */
  async login(data: LoginData): Promise<AuthResponse> {
    const { email, password } = data;

    // Check rate limit
    const rateCheck = checkRateLimit(email);
    if (!rateCheck.allowed) {
      throw new Error(`Demasiados intentos. Intenta en ${rateCheck.minutesLeft} minutos.`);
    }

    const teacher = await prisma.teacher.findUnique({
      where: { email },
    });

    if (!teacher) {
      recordFailedLogin(email);
      throw new Error('Credenciales inválidas');
    }

    const isValidPassword = await bcrypt.compare(password, teacher.password_hash);

    if (!isValidPassword) {
      recordFailedLogin(email);
      throw new Error('Credenciales inválidas');
    }

    // Successful login — reset rate limit
    resetLoginAttempts(email);

    const token = this.generateToken(teacher.id);

    return {
      token,
      teacher: {
        id: teacher.id,
        email: teacher.email,
        name: teacher.name,
        is_verified: teacher.is_verified,
      },
    };
  }

  /**
   * Obtener datos del profesor actual (por ID del JWT)
   */
  async getCurrentTeacher(teacherId: string) {
    const teacher = await prisma.teacher.findUnique({
      where: { id: teacherId },
      select: {
        id: true,
        email: true,
        name: true,
        is_verified: true,
        created_at: true,
      },
    });

    if (!teacher) {
      throw new Error('Profesor no encontrado');
    }

    return teacher;
  }

  /**
   * Forgot password — genera token y envía email
   */
  async forgotPassword(email: string): Promise<void> {
    const teacher = await prisma.teacher.findUnique({
      where: { email },
    });

    // Don't reveal if email exists
    if (!teacher) return;

    const reset_token = crypto.randomUUID();
    const reset_token_exp = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.teacher.update({
      where: { id: teacher.id },
      data: { reset_token, reset_token_exp },
    });

    const resetUrl = `${FRONTEND_URL}/reset-password?token=${reset_token}`;
    await sendPasswordResetEmail(email, teacher.name, resetUrl);
  }

  /**
   * Reset password — valida token y actualiza contraseña
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const teacher = await prisma.teacher.findUnique({
      where: { reset_token: token },
    });

    if (!teacher || !teacher.reset_token_exp || teacher.reset_token_exp < new Date()) {
      throw new Error('Token inválido o expirado');
    }

    const password_hash = await bcrypt.hash(newPassword, 10);

    await prisma.teacher.update({
      where: { id: teacher.id },
      data: {
        password_hash,
        reset_token: null,
        reset_token_exp: null,
      },
    });
  }

  /**
   * Change password (autenticado)
   */
  async changePassword(teacherId: string, currentPassword: string, newPassword: string): Promise<void> {
    const teacher = await prisma.teacher.findUnique({
      where: { id: teacherId },
    });

    if (!teacher) {
      throw new Error('Profesor no encontrado');
    }

    const isValid = await bcrypt.compare(currentPassword, teacher.password_hash);
    if (!isValid) {
      throw new Error('Contraseña actual incorrecta');
    }

    const password_hash = await bcrypt.hash(newPassword, 10);

    await prisma.teacher.update({
      where: { id: teacher.id },
      data: { password_hash },
    });
  }

  /**
   * Verify email — valida token y marca como verificado
   */
  async verifyEmail(token: string): Promise<void> {
    const teacher = await prisma.teacher.findUnique({
      where: { verification_token: token },
    });

    if (!teacher) {
      throw new Error('Token de verificación inválido');
    }

    await prisma.teacher.update({
      where: { id: teacher.id },
      data: {
        is_verified: true,
        verification_token: null,
      },
    });
  }

  /**
   * Resend verification email
   */
  async resendVerification(teacherId: string): Promise<void> {
    const teacher = await prisma.teacher.findUnique({
      where: { id: teacherId },
    });

    if (!teacher) {
      throw new Error('Profesor no encontrado');
    }

    if (teacher.is_verified) {
      throw new Error('El email ya está verificado');
    }

    const verification_token = crypto.randomUUID();

    await prisma.teacher.update({
      where: { id: teacher.id },
      data: { verification_token },
    });

    const verifyUrl = `${FRONTEND_URL}/verify-email?token=${verification_token}`;
    await sendVerificationEmail(teacher.email, teacher.name, verifyUrl);
  }

  /**
   * Generar JWT (expira en 7 días)
   */
  private generateToken(teacherId: string): string {
    return jwt.sign(
      { teacherId },
      env.JWT_SECRET,
      { expiresIn: '7d' }
    );
  }

  /**
   * Verificar JWT y extraer teacherId
   */
  verifyToken(token: string): { teacherId: string } {
    try {
      const decoded = jwt.verify(token, env.JWT_SECRET) as { teacherId: string };
      return decoded;
    } catch (error) {
      throw new Error('Token inválido o expirado');
    }
  }
}

// Exportar instancia única del servicio
export const authService = new AuthService();
