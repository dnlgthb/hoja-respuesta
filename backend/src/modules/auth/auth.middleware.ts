// Middleware de Autenticación - Protege rutas
import { Request, Response, NextFunction } from 'express';
import { authService } from './auth.service';

// Extender el tipo Request de Express para incluir teacherId
declare global {
  namespace Express {
    interface Request {
      teacherId?: string;
    }
  }
}

/**
 * Middleware para proteger rutas
 * Verifica que el token JWT sea válido
 * Agrega teacherId al objeto request
 */
export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // 1. Obtener token del header Authorization
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'No se proporcionó token de autenticación' });
      return;
    }
    
    const token = authHeader.substring(7); // Remover "Bearer "
    
    // 2. Verificar token
    const { teacherId } = authService.verifyToken(token);
    
    // 3. Agregar teacherId al request para usarlo en los controllers
    req.teacherId = teacherId;
    
    // 4. Continuar con el siguiente middleware/controller
    next();
    
  } catch (error) {
    res.status(401).json({ error: 'Token inválido o expirado' });
  }
};
