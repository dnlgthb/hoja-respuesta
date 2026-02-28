// Rutas de Pagos — Suscripciones Flow
import { Router } from 'express';
import { paymentsController } from './payments.controller';
import { authMiddleware } from '../auth/auth.middleware';

const router = Router();

// Rutas protegidas (requieren JWT)
router.get('/subscription', authMiddleware, (req, res) => paymentsController.getSubscription(req, res));
router.post('/create-subscription', authMiddleware, (req, res) => paymentsController.createSubscription(req, res));
router.post('/cancel', authMiddleware, (req, res) => paymentsController.cancelSubscription(req, res));

// Webhook de Flow (público, validado por firma HMAC)
router.post('/webhook', (req, res) => paymentsController.webhook(req, res));

export default router;
