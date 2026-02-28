// Middleware de Suscripción — Gate para endpoints costosos
import { Request, Response, NextFunction } from 'express';
import prisma from '../../config/database';

/**
 * Auto-transition subscription status based on dates.
 * ACTIVE → GRACE_PERIOD when period_end passes.
 * GRACE_PERIOD → SUSPENDED when grace_period_end passes.
 */
async function autoTransitionStatus(subscription: {
  status: string;
  period_end: Date;
  grace_period_end: Date | null;
}, subscriptionId?: string): Promise<string> {
  const now = new Date();
  let currentStatus = subscription.status;

  if (currentStatus === 'ACTIVE' && now > subscription.period_end) {
    currentStatus = 'GRACE_PERIOD';
    if (subscriptionId) {
      await prisma.subscription.update({
        where: { id: subscriptionId },
        data: { status: 'GRACE_PERIOD' },
      }).catch(err => console.error('[Subscription] Error transitioning to GRACE_PERIOD:', err));
      console.log(`[Subscription] Auto-transitioned ${subscriptionId} to GRACE_PERIOD`);
    }
  }

  if (currentStatus === 'GRACE_PERIOD' && subscription.grace_period_end && now > subscription.grace_period_end) {
    currentStatus = 'SUSPENDED';
    if (subscriptionId) {
      await prisma.subscription.update({
        where: { id: subscriptionId },
        data: { status: 'SUSPENDED' },
      }).catch(err => console.error('[Subscription] Error transitioning to SUSPENDED:', err));
      console.log(`[Subscription] Auto-transitioned ${subscriptionId} to SUSPENDED`);
    }
  }

  return currentStatus;
}

/**
 * Auto-transition institutional subscription status.
 */
async function autoTransitionInstitutionStatus(instSub: {
  id: string;
  status: string;
  period_end: Date;
}): Promise<string> {
  const now = new Date();
  let currentStatus = instSub.status;

  if (currentStatus === 'ACTIVE' && now > instSub.period_end) {
    currentStatus = 'GRACE_PERIOD';
    await prisma.institutionSubscription.update({
      where: { id: instSub.id },
      data: { status: 'GRACE_PERIOD' },
    }).catch(err => console.error('[Subscription] Error transitioning institution to GRACE_PERIOD:', err));
    console.log(`[Subscription] Institution sub ${instSub.id} auto-transitioned to GRACE_PERIOD`);
  }

  // Institutions get 7 days grace (vs 1 day for personal)
  if (currentStatus === 'GRACE_PERIOD') {
    const graceEnd = new Date(instSub.period_end);
    graceEnd.setDate(graceEnd.getDate() + 7);
    if (now > graceEnd) {
      currentStatus = 'SUSPENDED';
      await prisma.institutionSubscription.update({
        where: { id: instSub.id },
        data: { status: 'SUSPENDED' },
      }).catch(err => console.error('[Subscription] Error transitioning institution to SUSPENDED:', err));
      console.log(`[Subscription] Institution sub ${instSub.id} auto-transitioned to SUSPENDED`);
    }
  }

  return currentStatus;
}

// Export for use in payments service
export { autoTransitionStatus };

/**
 * Verifica que el profesor tenga suscripción activa.
 * Bypass total si is_beta === true.
 * Bypass si tiene institución con suscripción activa.
 * Auto-transitions ACTIVE→GRACE_PERIOD→SUSPENDED based on dates.
 */
export const requireActiveSubscription = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const teacherId = req.teacherId;
    if (!teacherId) {
      res.status(401).json({ error: 'No autenticado' });
      return;
    }

    const teacher = await prisma.teacher.findUnique({
      where: { id: teacherId },
      select: {
        is_beta: true,
        institution_id: true,
        institution: {
          select: {
            subscription: {
              select: { id: true, status: true, period_end: true },
            },
          },
        },
        subscription: {
          select: { id: true, status: true, period_end: true, grace_period_end: true },
        },
      },
    });

    if (!teacher) {
      res.status(401).json({ error: 'Profesor no encontrado' });
      return;
    }

    // 1. Beta users bypass everything
    if (teacher.is_beta) {
      next();
      return;
    }

    // 2. Institutional subscription
    if (teacher.institution_id && teacher.institution?.subscription) {
      const instSub = teacher.institution.subscription;
      const realStatus = await autoTransitionInstitutionStatus(instSub);
      if (realStatus === 'ACTIVE' || realStatus === 'GRACE_PERIOD') {
        next();
        return;
      }
      res.status(403).json({ error: 'subscription_suspended', message: 'La suscripción de tu institución está suspendida. Contacta al administrador.' });
      return;
    }

    // 3. Personal subscription — auto-transition based on dates
    if (teacher.subscription) {
      const sub = teacher.subscription;
      const realStatus = await autoTransitionStatus(sub, sub.id);
      if (realStatus === 'ACTIVE' || realStatus === 'GRACE_PERIOD') {
        next();
        return;
      }
      res.status(403).json({ error: 'subscription_suspended', message: 'Tu suscripción está suspendida. Renueva para continuar usando la plataforma.' });
      return;
    }

    // 4. No subscription at all
    res.status(403).json({ error: 'subscription_required', message: 'Necesitas una suscripción activa para usar esta función.' });

  } catch (error) {
    console.error('Error in subscription middleware:', error);
    res.status(500).json({ error: 'Error al verificar suscripción' });
  }
};
