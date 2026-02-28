// Servicio de Pagos — Lógica de negocio para suscripciones Flow
import prisma from '../../config/database';
import { flowAPI, verifyWebhookSignature } from '../../config/flow';
import { env } from '../../config/env';
import { autoTransitionStatus } from '../auth/subscription.middleware';

const PLAN_ID = 'aproba-personal-monthly';
const PLAN_PRICE = 8990; // CLP con IVA

// ============================================
// SUBSCRIPTION STATUS
// ============================================

interface SubscriptionInfo {
  hasSubscription: boolean;
  status: string | null;
  type: 'beta' | 'institutional' | 'personal' | 'none';
  periodEnd: Date | null;
  gracePeriodEnd: Date | null;
  price: number | null;
  usage: { studentAttempts: number; pdfAnalyses: number } | null;
}

export const paymentsService = {
  /**
   * Obtener estado completo de suscripción de un profesor
   */
  async getSubscriptionStatus(teacherId: string): Promise<SubscriptionInfo> {
    const teacher = await prisma.teacher.findUnique({
      where: { id: teacherId },
      select: {
        is_beta: true,
        institution_id: true,
        institution: {
          select: {
            name: true,
            subscription: { select: { status: true, period_end: true } },
          },
        },
        subscription: {
          select: {
            id: true,
            status: true,
            price: true,
            period_start: true,
            period_end: true,
            grace_period_end: true,
            flow_subscription_id: true,
          },
        },
      },
    });

    if (!teacher) throw new Error('Profesor no encontrado');

    // Get current month usage
    const now = new Date();
    const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const usage = await prisma.usageCounter.findUnique({
      where: { teacher_id_period_start: { teacher_id: teacherId, period_start: periodStart } },
    });

    const usageInfo = {
      studentAttempts: usage?.student_attempts ?? 0,
      pdfAnalyses: usage?.pdf_analyses ?? 0,
    };

    // Beta
    if (teacher.is_beta) {
      return {
        hasSubscription: true,
        status: 'ACTIVE',
        type: 'beta',
        periodEnd: null,
        gracePeriodEnd: null,
        price: null,
        usage: usageInfo,
      };
    }

    // Institutional
    if (teacher.institution_id && teacher.institution?.subscription) {
      const instSub = teacher.institution.subscription;
      return {
        hasSubscription: instSub.status === 'ACTIVE' || instSub.status === 'GRACE_PERIOD',
        status: instSub.status,
        type: 'institutional',
        periodEnd: instSub.period_end,
        gracePeriodEnd: null,
        price: null,
        usage: usageInfo,
      };
    }

    // Personal — auto-transition status based on dates
    if (teacher.subscription) {
      const sub = teacher.subscription;
      const realStatus = await autoTransitionStatus(sub, sub.id);
      return {
        hasSubscription: realStatus === 'ACTIVE' || realStatus === 'GRACE_PERIOD',
        status: realStatus,
        type: 'personal',
        periodEnd: sub.period_end,
        gracePeriodEnd: sub.grace_period_end,
        price: Number(sub.price),
        usage: usageInfo,
      };
    }

    // No subscription
    return {
      hasSubscription: false,
      status: null,
      type: 'none',
      periodEnd: null,
      gracePeriodEnd: null,
      price: null,
      usage: usageInfo,
    };
  },

  // ============================================
  // CREATE SUBSCRIPTION (Flow)
  // ============================================

  /**
   * Crear suscripción para un profesor.
   * 1. Crear/obtener customer en Flow
   * 2. Crear pago inicial (Flow redirige a checkout)
   * 3. Retornar URL de redirección a Flow
   */
  async createSubscription(teacherId: string): Promise<{ paymentUrl: string; token: string }> {
    if (!env.FLOW_API_KEY || !env.FLOW_SECRET_KEY) {
      throw new Error('Flow no está configurado. Contacta al administrador.');
    }

    const teacher = await prisma.teacher.findUnique({
      where: { id: teacherId },
      select: { id: true, email: true, name: true, subscription: true, is_beta: true },
    });

    if (!teacher) throw new Error('Profesor no encontrado');
    if (teacher.is_beta) throw new Error('Las cuentas beta no necesitan suscripción');

    // Check if already has active subscription
    if (teacher.subscription && (teacher.subscription.status === 'ACTIVE' || teacher.subscription.status === 'GRACE_PERIOD')) {
      throw new Error('Ya tienes una suscripción activa');
    }

    // Create payment order in Flow
    const commerceOrder = `aproba-${teacherId}-${Date.now()}`;

    const flowResponse = await flowAPI.createPayment({
      commerceOrder,
      subject: 'Suscripción Aproba - Plan Personal Mensual',
      currency: 'CLP',
      amount: String(PLAN_PRICE),
      email: teacher.email,
      urlConfirmation: env.FLOW_WEBHOOK_URL,
      urlReturn: `${env.FLOW_RETURN_URL}?payment=pending`,
    });

    // flowResponse should have { url, token, flowOrder }
    const paymentUrl = `${flowResponse.url}?token=${flowResponse.token}`;

    // Create pending subscription + payment in our DB
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    // Upsert subscription (might exist from a previous cancelled one)
    await prisma.subscription.upsert({
      where: { teacher_id: teacherId },
      update: {
        status: 'ACTIVE', // Will be confirmed by webhook
        price: PLAN_PRICE,
        period_start: now,
        period_end: periodEnd,
        flow_subscription_id: flowResponse.flowOrder?.toString() || commerceOrder,
      },
      create: {
        teacher_id: teacherId,
        status: 'ACTIVE', // Optimistic — webhook confirms
        price: PLAN_PRICE,
        period_start: now,
        period_end: periodEnd,
        flow_subscription_id: flowResponse.flowOrder?.toString() || commerceOrder,
      },
    });

    // Create pending payment record
    const subscription = await prisma.subscription.findUnique({ where: { teacher_id: teacherId } });
    if (subscription) {
      await prisma.payment.create({
        data: {
          subscription_id: subscription.id,
          flow_payment_id: flowResponse.flowOrder?.toString(),
          amount: PLAN_PRICE,
          status: 'PENDING',
          payment_date: now,
        },
      });
    }

    return { paymentUrl, token: flowResponse.token };
  },

  // ============================================
  // WEBHOOK HANDLER
  // ============================================

  /**
   * Procesar webhook de Flow.
   * Flow envía notificaciones cuando cambia el estado de un pago.
   */
  async handleWebhook(body: Record<string, string>): Promise<void> {
    console.log('[Payments] Webhook received:', JSON.stringify(body));

    // 1. Validate signature
    // Flow webhook sends a token, we need to fetch the payment status
    const { token } = body;

    if (!token) {
      console.warn('[Payments] Webhook missing token');
      return;
    }

    // 2. Get payment status from Flow using the token
    let flowPayment: any;
    try {
      flowPayment = await flowAPI.getPaymentStatus(token);
    } catch (error) {
      console.error('[Payments] Error fetching payment status from Flow:', error);
      // Try by flow order
      try {
        const response = await fetch(`${env.FLOW_API_URL}/payment/getStatusByFlowOrder?${new URLSearchParams({
          apiKey: env.FLOW_API_KEY,
          flowOrder: token,
          s: '', // Will need proper signing
        })}`);
        flowPayment = await response.json();
      } catch {
        console.error('[Payments] Could not fetch payment by flow order either');
        return;
      }
    }

    console.log('[Payments] Flow payment status:', JSON.stringify(flowPayment));

    if (!flowPayment || !flowPayment.status) {
      console.warn('[Payments] Invalid flow payment response');
      return;
    }

    // Flow payment statuses: 1=pending, 2=paid, 3=rejected, 4=cancelled
    const flowStatus = flowPayment.status;
    const commerceOrder = flowPayment.commerceOrder;

    if (!commerceOrder) {
      console.warn('[Payments] No commerceOrder in flow response');
      return;
    }

    // Extract teacherId from commerceOrder (format: aproba-{teacherId}-{timestamp})
    const parts = commerceOrder.split('-');
    if (parts.length < 3 || parts[0] !== 'aproba') {
      console.warn('[Payments] Unrecognized commerceOrder format:', commerceOrder);
      return;
    }
    const teacherId = parts.slice(1, -1).join('-'); // cuid can contain hyphens

    // Find subscription
    const subscription = await prisma.subscription.findUnique({
      where: { teacher_id: teacherId },
    });

    if (!subscription) {
      console.warn('[Payments] No subscription found for teacher:', teacherId);
      return;
    }

    // Update payment status
    const paymentStatus = flowStatus === 2 ? 'COMPLETED' : flowStatus === 3 ? 'FAILED' : flowStatus === 4 ? 'FAILED' : 'PENDING';

    // Find the pending payment
    const pendingPayment = await prisma.payment.findFirst({
      where: {
        subscription_id: subscription.id,
        status: 'PENDING',
      },
      orderBy: { created_at: 'desc' },
    });

    if (pendingPayment) {
      await prisma.payment.update({
        where: { id: pendingPayment.id },
        data: {
          status: paymentStatus as any,
          flow_payment_id: flowPayment.flowOrder?.toString(),
          payment_date: new Date(),
        },
      });
    }

    // Update subscription status based on payment result
    if (flowStatus === 2) {
      // Payment successful
      const now = new Date();
      const periodEnd = new Date(now);
      periodEnd.setMonth(periodEnd.getMonth() + 1);
      const gracePeriodEnd = new Date(periodEnd);
      gracePeriodEnd.setDate(gracePeriodEnd.getDate() + 1);

      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          status: 'ACTIVE',
          period_start: now,
          period_end: periodEnd,
          grace_period_end: gracePeriodEnd,
        },
      });

      console.log(`[Payments] Subscription ACTIVATED for teacher ${teacherId}`);
    } else if (flowStatus === 3 || flowStatus === 4) {
      // Payment rejected/cancelled
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { status: 'SUSPENDED' },
      });

      console.log(`[Payments] Subscription SUSPENDED for teacher ${teacherId} (payment ${flowStatus === 3 ? 'rejected' : 'cancelled'})`);
    }
  },

  // ============================================
  // CANCEL SUBSCRIPTION
  // ============================================

  /**
   * Cancelar suscripción. Mantiene acceso hasta fin del período pagado.
   */
  async cancelSubscription(teacherId: string): Promise<{ message: string; periodEnd: Date | null }> {
    const subscription = await prisma.subscription.findUnique({
      where: { teacher_id: teacherId },
    });

    if (!subscription) {
      throw new Error('No tienes una suscripción activa');
    }

    if (subscription.status === 'CANCELLED') {
      throw new Error('Tu suscripción ya está cancelada');
    }

    // Cancel in Flow if we have a subscription ID
    if (subscription.flow_subscription_id && env.FLOW_API_KEY) {
      try {
        await flowAPI.cancelSubscription(subscription.flow_subscription_id, true);
      } catch (error) {
        console.warn('[Payments] Could not cancel in Flow (may be one-time payment):', error);
        // Continue — we still cancel locally
      }
    }

    // Update local status
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: 'CANCELLED' },
    });

    return {
      message: `Tu suscripción ha sido cancelada. Mantienes acceso hasta ${subscription.period_end.toLocaleDateString('es-CL')}.`,
      periodEnd: subscription.period_end,
    };
  },
};
