// Controlador de Autenticación - Maneja peticiones HTTP
import { Request, Response } from 'express';
import { authService } from './auth.service';

export class AuthController {
  
  /**
   * POST /api/auth/register
   * Registrar un nuevo profesor
   */
  async register(req: Request, res: Response): Promise<void> {
    try {
      const { email, password, name } = req.body;
      
      // Validaciones básicas
      if (!email || !password || !name) {
        res.status(400).json({ error: 'Email, password y nombre son requeridos' });
        return;
      }
      
      if (password.length < 6) {
        res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
        return;
      }
      
      // Registrar profesor
      const result = await authService.register({ email, password, name });
      
      res.status(201).json(result);
      
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
   * Login de profesor
   */
  async login(req: Request, res: Response): Promise<void> {
    try {
      const { email, password } = req.body;
      
      // Validaciones básicas
      if (!email || !password) {
        res.status(400).json({ error: 'Email y password son requeridos' });
        return;
      }
      
      // Login
      const result = await authService.login({ email, password });
      
      res.status(200).json(result);
      
    } catch (error) {
      if (error instanceof Error) {
        res.status(401).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Error al iniciar sesión' });
      }
    }
  }
  
  /**
   * GET /api/auth/me
   * Obtener datos del profesor actual (requiere autenticación)
   */
  async me(req: Request, res: Response): Promise<void> {
    try {
      // teacherId viene del middleware de autenticación
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
}

// Exportar instancia única del controlador
export const authController = new AuthController();
