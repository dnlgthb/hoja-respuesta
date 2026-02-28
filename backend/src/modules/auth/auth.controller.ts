// Controlador de Autenticación - Maneja peticiones HTTP
import { Request, Response } from 'express';
import { authService } from './auth.service';

export class AuthController {

  /**
   * POST /api/auth/register
   */
  async register(req: Request, res: Response): Promise<void> {
    try {
      // Beta cerrada — registro público deshabilitado
      res.status(403).json({
        error: 'registration_closed',
        message: 'Aproba se encuentra en beta cerrada. Pronto habilitaremos el registro público.',
      });
      return;
    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Error al registrar profesor' });
      }
    }
  }

  /**
   * POST /api/auth/login
   */
  async login(req: Request, res: Response): Promise<void> {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        res.status(400).json({ error: 'Email y password son requeridos' });
        return;
      }

      const result = await authService.login({ email, password });
      res.status(200).json(result);
    } catch (error) {
      if (error instanceof Error) {
        // Rate limit → 429
        if (error.message.startsWith('Demasiados intentos')) {
          res.status(429).json({ error: error.message });
        } else {
          res.status(401).json({ error: error.message });
        }
      } else {
        res.status(500).json({ error: 'Error al iniciar sesión' });
      }
    }
  }

  /**
   * GET /api/auth/me
   */
  async me(req: Request, res: Response): Promise<void> {
    try {
      const teacherId = req.teacherId!;
      const teacher = await authService.getCurrentTeacher(teacherId);
      res.status(200).json(teacher);
    } catch (error) {
      if (error instanceof Error) {
        res.status(404).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Error al obtener datos del profesor' });
      }
    }
  }

  /**
   * POST /api/auth/forgot-password
   */
  async forgotPassword(req: Request, res: Response): Promise<void> {
    try {
      const { email } = req.body;

      if (!email) {
        res.status(400).json({ error: 'Email es requerido' });
        return;
      }

      await authService.forgotPassword(email);
      // Always respond 200 — don't reveal if email exists
      res.status(200).json({ message: 'Si el email existe, recibirás un enlace de recuperación.' });
    } catch (error) {
      // Even on error, respond 200 to not reveal info
      res.status(200).json({ message: 'Si el email existe, recibirás un enlace de recuperación.' });
    }
  }

  /**
   * POST /api/auth/reset-password
   */
  async resetPassword(req: Request, res: Response): Promise<void> {
    try {
      const { token, password } = req.body;

      if (!token || !password) {
        res.status(400).json({ error: 'Token y contraseña son requeridos' });
        return;
      }

      if (password.length < 6) {
        res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
        return;
      }

      await authService.resetPassword(token, password);
      res.status(200).json({ message: 'Contraseña actualizada exitosamente.' });
    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Error al restablecer contraseña' });
      }
    }
  }

  /**
   * PUT /api/auth/change-password (autenticado)
   */
  async changePassword(req: Request, res: Response): Promise<void> {
    try {
      const teacherId = req.teacherId!;
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        res.status(400).json({ error: 'Contraseña actual y nueva son requeridas' });
        return;
      }

      if (newPassword.length < 6) {
        res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' });
        return;
      }

      await authService.changePassword(teacherId, currentPassword, newPassword);
      res.status(200).json({ message: 'Contraseña actualizada exitosamente.' });
    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Error al cambiar contraseña' });
      }
    }
  }

  /**
   * POST /api/auth/verify-email
   */
  async verifyEmail(req: Request, res: Response): Promise<void> {
    try {
      const { token } = req.body;

      if (!token) {
        res.status(400).json({ error: 'Token es requerido' });
        return;
      }

      await authService.verifyEmail(token);
      res.status(200).json({ message: 'Email verificado exitosamente.' });
    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Error al verificar email' });
      }
    }
  }

  /**
   * POST /api/auth/resend-verification (autenticado)
   */
  async resendVerification(req: Request, res: Response): Promise<void> {
    try {
      const teacherId = req.teacherId!;
      await authService.resendVerification(teacherId);
      res.status(200).json({ message: 'Email de verificación reenviado.' });
    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Error al reenviar verificación' });
      }
    }
  }
}

// Exportar instancia única del controlador
export const authController = new AuthController();
