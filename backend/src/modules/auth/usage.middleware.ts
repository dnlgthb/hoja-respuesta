// Middleware de Uso — Tracking y límites mensuales
import { Request, Response, NextFunction } from 'express';
import prisma from '../../config/database';

// Límites mensuales por plan personal
const LIMITS = {
  pdf_analyses: 50,
  student_attempts: 500,
};

/** Get the first day of the current month (UTC) */
function getCurrentPeriodStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Get or create the usage counter for current month */
async function getOrCreateCounter(teacherId: string) {
  const periodStart = getCurrentPeriodStart();

  return prisma.usageCounter.upsert({
    where: {
      teacher_id_period_start: { teacher_id: teacherId, period_start: periodStart },
    },
    update: {},
    create: {
      teacher_id: teacherId,
      period_start: periodStart,
    },
  });
}

// ============================================
// TRACKING FUNCTIONS (always run, even for beta)
// ============================================

/** Track a PDF analysis usage */
export async function trackPdfAnalysis(teacherId: string): Promise<void> {
  const periodStart = getCurrentPeriodStart();
  await prisma.usageCounter.upsert({
    where: {
      teacher_id_period_start: { teacher_id: teacherId, period_start: periodStart },
    },
    update: { pdf_analyses: { increment: 1 } },
    create: { teacher_id: teacherId, period_start: periodStart, pdf_analyses: 1 },
  });
}

/** Track a student attempt usage */
export async function trackAttemptUsage(teacherId: string): Promise<void> {
  const periodStart = getCurrentPeriodStart();
  await prisma.usageCounter.upsert({
    where: {
      teacher_id_period_start: { teacher_id: teacherId, period_start: periodStart },
    },
    update: { student_attempts: { increment: 1 } },
    create: { teacher_id: teacherId, period_start: periodStart, student_attempts: 1 },
  });
}

// ============================================
// LIMIT-CHECKING MIDDLEWARES (skip for beta)
// ============================================

/**
 * Check PDF analysis limit. Beta users pass through.
 * Must be applied BEFORE the route handler.
 */
export const checkPdfAnalysisLimit = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const teacherId = req.teacherId;
    if (!teacherId) { next(); return; }

    // Check if beta
    const teacher = await prisma.teacher.findUnique({
      where: { id: teacherId },
      select: { is_beta: true },
    });
    if (teacher?.is_beta) { next(); return; }

    const counter = await getOrCreateCounter(teacherId);
    if (counter.pdf_analyses >= LIMITS.pdf_analyses) {
      res.status(403).json({
        error: 'pdf_analysis_limit_reached',
        message: `Has alcanzado el límite de ${LIMITS.pdf_analyses} análisis de PDF este mes. Espera al próximo mes o mejora tu plan.`,
        current: counter.pdf_analyses,
        limit: LIMITS.pdf_analyses,
      });
      return;
    }

    next();
  } catch (error) {
    console.error('Error checking PDF analysis limit:', error);
    next(); // Don't block on errors
  }
};

/**
 * Check student attempts limit for the test's teacher.
 * For teacher-authenticated routes, uses req.teacherId.
 */
export const checkAttemptsLimit = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const teacherId = req.teacherId;
    if (!teacherId) { next(); return; }

    const teacher = await prisma.teacher.findUnique({
      where: { id: teacherId },
      select: { is_beta: true },
    });
    if (teacher?.is_beta) { next(); return; }

    const counter = await getOrCreateCounter(teacherId);
    if (counter.student_attempts >= LIMITS.student_attempts) {
      res.status(403).json({
        error: 'attempts_limit_reached',
        message: `Has alcanzado el límite de ${LIMITS.student_attempts} intentos de estudiantes este mes. Espera al próximo mes o mejora tu plan.`,
        current: counter.student_attempts,
        limit: LIMITS.student_attempts,
      });
      return;
    }

    next();
  } catch (error) {
    console.error('Error checking attempts limit:', error);
    next(); // Don't block on errors
  }
};
