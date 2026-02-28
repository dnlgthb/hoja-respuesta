// Cliente Flow.cl — Pasarela de pagos chilena
// Docs: https://developers.flow.cl/en/api
import crypto from 'crypto';
import { env } from './env';

/**
 * Genera firma HMAC-SHA256 para Flow API.
 * 1. Ordenar params alfabéticamente por key
 * 2. Concatenar key=value con &
 * 3. Firmar con secretKey
 */
function signParams(params: Record<string, string>): string {
  const sorted = Object.keys(params).sort();
  const packed = sorted.map(k => `${k}${params[k]}`).join('');
  return crypto
    .createHmac('sha256', env.FLOW_SECRET_KEY)
    .update(packed)
    .digest('hex');
}

/**
 * POST request a Flow API
 */
async function flowPost(endpoint: string, params: Record<string, string>): Promise<any> {
  const allParams = { ...params, apiKey: env.FLOW_API_KEY };
  const signature = signParams(allParams);

  const body = new URLSearchParams({ ...allParams, s: signature });

  const url = `${env.FLOW_API_URL}/${endpoint}`;
  console.log(`[Flow] POST ${url}`);

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const data = await response.json() as Record<string, any>;

  if (!response.ok) {
    console.error('[Flow] Error response:', data);
    throw new Error(data.message || data.error || `Flow API error ${response.status}`);
  }

  return data;
}

/**
 * GET request a Flow API
 */
async function flowGet(endpoint: string, params: Record<string, string> = {}): Promise<any> {
  const allParams = { ...params, apiKey: env.FLOW_API_KEY };
  const signature = signParams(allParams);

  const query = new URLSearchParams({ ...allParams, s: signature });
  const url = `${env.FLOW_API_URL}/${endpoint}?${query.toString()}`;
  console.log(`[Flow] GET ${url}`);

  const response = await fetch(url, { method: 'GET' });
  const data = await response.json() as Record<string, any>;

  if (!response.ok) {
    console.error('[Flow] Error response:', data);
    throw new Error(data.message || data.error || `Flow API error ${response.status}`);
  }

  return data;
}

/**
 * Verifica la firma de un webhook de Flow.
 * Flow envía los parámetros con una firma 's' que debemos validar.
 */
export function verifyWebhookSignature(params: Record<string, string>): boolean {
  const { s, ...rest } = params;
  if (!s) return false;
  const expected = signParams({ ...rest, apiKey: env.FLOW_API_KEY });
  return crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected));
}

// ============================================
// FLOW API METHODS
// ============================================

export const flowAPI = {
  /**
   * Crear un plan de suscripción en Flow.
   * Solo necesita hacerse una vez (o cuando cambie el precio).
   */
  createPlan: (params: {
    planId: string;      // ID único del plan (ej: "aproba-personal-monthly")
    name: string;        // Nombre visible
    currency: string;    // "CLP"
    amount: string;      // Monto en CLP
    interval: string;    // 3 = mensual (1=diario, 2=semanal, 3=mensual, 4=anual)
  }) => flowPost('plans/create', params),

  /**
   * Obtener info de un plan
   */
  getPlan: (planId: string) => flowGet('plans/get', { planId }),

  /**
   * Crear un cliente en Flow
   */
  createCustomer: (params: {
    name: string;
    email: string;
    externalId: string; // nuestro teacher.id
  }) => flowPost('customer/create', params),

  /**
   * Obtener info de un cliente
   */
  getCustomer: (customerId: string) => flowGet('customer/get', { customerId }),

  /**
   * Registrar tarjeta de un cliente (redirige a Flow para ingresar tarjeta)
   */
  registerCustomerCard: (customerId: string, urlReturn: string) =>
    flowPost('customer/register', { customerId, url_return: urlReturn }),

  /**
   * Crear suscripción: vincula cliente a plan.
   * Flow cobra automáticamente cada mes.
   */
  createSubscription: (params: {
    planId: string;
    customerId: string;
    subscription_start?: string; // Fecha inicio (YYYY-MM-DD), default hoy
  }) => flowPost('subscription/create', params),

  /**
   * Obtener estado de una suscripción
   */
  getSubscription: (subscriptionId: string) =>
    flowGet('subscription/get', { subscriptionId }),

  /**
   * Cancelar suscripción
   */
  cancelSubscription: (subscriptionId: string, at_period_end: boolean = true) =>
    flowPost('subscription/cancel', { subscriptionId, at_period_end: at_period_end ? '1' : '0' }),

  /**
   * Obtener estado de un pago por commerceId
   */
  getPaymentStatus: (commerceId: string) =>
    flowGet('payment/getStatus', { commerceId }),

  /**
   * Crear un cobro directo (pago único, alternativa a suscripción)
   * Usado para el primer pago cuando el cliente registra su tarjeta.
   */
  createPayment: (params: {
    commerceOrder: string;
    subject: string;
    currency: string;
    amount: string;
    email: string;
    urlConfirmation: string;
    urlReturn: string;
    paymentMethod?: string; // 9 = todos
  }) => flowPost('payment/create', { paymentMethod: '9', ...params }),
};
