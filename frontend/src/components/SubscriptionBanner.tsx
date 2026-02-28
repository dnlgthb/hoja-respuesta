'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { paymentsAPI, SubscriptionInfo } from '@/lib/api';
import { ROUTES } from '@/config/constants';
import { AlertTriangle, CreditCard, TrendingUp } from 'lucide-react';

export default function SubscriptionBanner() {
  const router = useRouter();
  const [sub, setSub] = useState<SubscriptionInfo | null>(null);

  useEffect(() => {
    paymentsAPI.getSubscription().then(setSub).catch(() => {});
  }, []);

  if (!sub) return null;

  // Beta or active subscription — no banner needed
  if (sub.type === 'beta' || (sub.hasSubscription && sub.status === 'ACTIVE')) {
    // Show usage warning if close to limits
    if (sub.usage) {
      const attemptsClose = sub.usage.studentAttempts >= 450;
      const pdfClose = sub.usage.pdfAnalyses >= 45;
      if (attemptsClose || pdfClose) {
        return (
          <div className="bg-amber-50 border-b border-amber-200">
            <div className="max-w-7xl mx-auto px-6 py-2.5 flex items-center gap-3">
              <TrendingUp className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <p className="text-sm text-amber-800">
                {attemptsClose && `${sub.usage.studentAttempts}/500 intentos usados este mes. `}
                {pdfClose && `${sub.usage.pdfAnalyses}/50 análisis PDF usados este mes.`}
              </p>
              <button
                onClick={() => router.push(ROUTES.PLANES)}
                className="text-sm text-amber-700 hover:text-amber-900 font-medium underline ml-auto"
              >
                Ver uso
              </button>
            </div>
          </div>
        );
      }
    }
    return null;
  }

  // Grace period
  if (sub.status === 'GRACE_PERIOD') {
    return (
      <div className="bg-amber-50 border-b border-amber-200">
        <div className="max-w-7xl mx-auto px-6 py-2.5 flex items-center gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <p className="text-sm text-amber-800 flex-1">
            Tu pago no se pudo procesar. Actualiza tu medio de pago para no perder acceso.
          </p>
          <button
            onClick={() => router.push(ROUTES.PLANES)}
            className="text-sm bg-amber-600 text-white px-3 py-1 rounded-md hover:bg-amber-700 font-medium"
          >
            Renovar
          </button>
        </div>
      </div>
    );
  }

  // Suspended
  if (sub.status === 'SUSPENDED' || sub.status === 'CANCELLED') {
    return (
      <div className="bg-red-50 border-b border-red-200">
        <div className="max-w-7xl mx-auto px-6 py-2.5 flex items-center gap-3">
          <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
          <p className="text-sm text-red-800 flex-1">
            Tu suscripción está {sub.status === 'CANCELLED' ? 'cancelada' : 'suspendida'}. Renueva para crear y activar pruebas.
          </p>
          <button
            onClick={() => router.push(ROUTES.PLANES)}
            className="text-sm bg-red-600 text-white px-3 py-1 rounded-md hover:bg-red-700 font-medium"
          >
            Reactivar
          </button>
        </div>
      </div>
    );
  }

  // No subscription
  if (!sub.hasSubscription) {
    return (
      <div className="bg-blue-50 border-b border-blue-200">
        <div className="max-w-7xl mx-auto px-6 py-2.5 flex items-center gap-3">
          <CreditCard className="w-4 h-4 text-blue-600 flex-shrink-0" />
          <p className="text-sm text-blue-800 flex-1">
            Necesitas una suscripción para crear y activar pruebas.
          </p>
          <button
            onClick={() => router.push(ROUTES.PLANES)}
            className="text-sm bg-primary text-white px-3 py-1 rounded-md hover:opacity-90 font-medium"
          >
            Ver planes
          </button>
        </div>
      </div>
    );
  }

  return null;
}
