// Servicio de Autenticación - Lógica de negocio
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../../config/database';
import { env } from '../../config/env';

// Tipos para las respuestas
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
  };
}

export class AuthService {
  
  /**
   * Registrar un nuevo profesor
   */
  async register(data: RegisterData): Promise<AuthResponse> {
    const { email, password, name } = data;
    
    // 1. Verificar que el email no exista
    const existingTeacher = await prisma.teacher.findUnique({
      where: { email },
    });
    
    if (existingTeacher) {
      throw new Error('El email ya está registrado');
    }
    
    // 2. Hash de la contraseña (bcrypt con 10 rondas)
    const password_hash = await bcrypt.hash(password, 10);
    
    // 3. Crear profesor en la BD
    const teacher = await prisma.teacher.create({
      data: {
        email,
        password_hash,
        name,
      },
    });
    
    // 4. Generar JWT
    const token = this.generateToken(teacher.id);
    
    return {
      token,
      teacher: {
        id: teacher.id,
        email: teacher.email,
        name: teacher.name,
      },
    };
  }
  
  /**
   * Login de profesor
   */
  async login(data: LoginData): Promise<AuthResponse> {
    const { email, password } = data;
    
    // 1. Buscar profesor por email
    const teacher = await prisma.teacher.findUnique({
      where: { email },
    });
    
    if (!teacher) {
      throw new Error('Credenciales inválidas');
    }
    
    // 2. Verificar contraseña
    const isValidPassword = await bcrypt.compare(password, teacher.password_hash);
    
    if (!isValidPassword) {
      throw new Error('Credenciales inválidas');
    }
    
    // 3. Generar JWT
    const token = this.generateToken(teacher.id);
    
    return {
      token,
      teacher: {
        id: teacher.id,
        email: teacher.email,
        name: teacher.name,
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
        created_at: true,
      },
    });
    
    if (!teacher) {
      throw new Error('Profesor no encontrado');
    }
    
    return teacher;
  }
  
  /**
   * Generar JWT
   * El token expira en 7 días
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
