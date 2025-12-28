// Rutas de Autenticación
import { Router } from 'express';
import { authController } from './auth.controller';
import { authMiddleware } from './auth.middleware';

const router = Router();

// Rutas públicas (no requieren autenticación)
router.post('/register', (req, res) => authController.register(req, res));
router.post('/login', (req, res) => authController.login(req, res));

// Rutas protegidas (requieren autenticación)
router.get('/me', authMiddleware, (req, res) => authController.me(req, res));

export default router;
