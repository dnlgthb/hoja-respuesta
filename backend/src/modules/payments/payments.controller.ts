// Controlador de Pagos — Maneja peticiones HTTP
import { Request, Response } from 'express';
import { paymentsService } from './payments.service';

export class PaymentsController {
  /**
   * GET /api/payments/subscription
   * Estado actual de suscripción del profesor
   */
  async getSubscription(req: Request, res: Response): Promise<void> {
    try {
      const teacherId = req.teacherId!;
      const status = await paymentsService.getSubscriptionStatus(teacherId);
      res.json(status);
    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Error al obtener estado de suscripción' });
      }
    }
  }

  /**
   * POST /api/payments/create-subscription
   * Crear suscripción en Flow → retorna URL de pago
   */
  async createSubscription(req: Request, res: Response): Promise<void> {
    try {
      const teacherId = req.teacherId!;
      const result = await paymentsService.createSubscription(teacherId);
      res.json(result);
    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Error al crear suscripción' });
      }
    }
  }

  /**
   * POST /api/payments/webhook
   * Recibir notificaciones de Flow (sin JWT, validado por firma)
   */
  async webhook(req: Request, res: Response): Promise<void> {
    try {
      // Flow sends form-encoded data
      const body = req.body;
      console.log('[Webhook] Received:', JSON.stringify(body));

      await paymentsService.handleWebhook(body);

      // Flow expects 200 response
      res.status(200).json({ received: true });
    } catch (error) {
      console.error('[Webhook] Error:', error);
      // Always return 200 to Flow to prevent retries on our processing errors
      res.status(200).json({ received: true, error: 'Processing error' });
    }
  }

  /**
   * POST /api/payments/cancel
   * Cancelar suscripción
   */
  async cancelSubscription(req: Request, res: Response): Promise<void> {
    try {
      const teacherId = req.teacherId!;
      const result = await paymentsService.cancelSubscription(teacherId);
      res.json(result);
    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Error al cancelar suscripción' });
      }
    }
  }
}

export const paymentsController = new PaymentsController();
