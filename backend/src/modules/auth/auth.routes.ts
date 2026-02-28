// Rutas de Autenticación
import { Router } from 'express';
import { authController } from './auth.controller';
import { authMiddleware } from './auth.middleware';

const router = Router();

// Rutas públicas (no requieren autenticación)
router.post('/register', (req, res) => authController.register(req, res));
router.post('/login', (req, res) => authController.login(req, res));
router.post('/forgot-password', (req, res) => authController.forgotPassword(req, res));
router.post('/reset-password', (req, res) => authController.resetPassword(req, res));
router.post('/verify-email', (req, res) => authController.verifyEmail(req, res));

// Rutas protegidas (requieren autenticación)
router.get('/me', authMiddleware, (req, res) => authController.me(req, res));
router.put('/change-password', authMiddleware, (req, res) => authController.changePassword(req, res));
router.post('/resend-verification', authMiddleware, (req, res) => authController.resendVerification(req, res));

export default router;
