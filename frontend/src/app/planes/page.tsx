'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import ProtectedRoute from '@/components/ProtectedRoute';
import Navbar from '@/components/Navbar';
import { paymentsAPI, SubscriptionInfo } from '@/lib/api';
import { ROUTES } from '@/config/constants';
import { Check, ArrowLeft, CreditCard, BarChart3, FileText, Users } from 'lucide-react';

export default function PlanesPage() {
  const router = useRouter();
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSubscription();
  }, []);

  const loadSubscription = async () => {
    try {
      const data = await paymentsAPI.getSubscription();
      setSubscription(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar info');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubscribe = async () => {
    try {
      setIsSubscribing(true);
      setError(null);
      const { paymentUrl } = await paymentsAPI.createSubscription();
      // Redirect to Flow payment page
      window.location.href = paymentUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear suscripción');
      setIsSubscribing(false);
    }
  };

  const isActive = subscription?.hasSubscription;

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-[#FBF9F3]">
        <Navbar />

        <div className="max-w-4xl mx-auto px-6 py-8">
          {/* Back button */}
          <button
            onClick={() => router.push(ROUTES.DASHBOARD)}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-8"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver al dashboard
          </button>

          <div className="text-center mb-10">
            <h1 className="text-3xl font-bold text-gray-900 mb-3">Plan Aproba</h1>
            <p className="text-gray-600 text-lg">
              Transforma tus pruebas PDF en evaluaciones digitales auto-calificables
            </p>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* Plan Card */}
              <div className="max-w-md mx-auto bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
                {/* Header */}
                <div className="bg-primary text-white px-8 py-6 text-center">
                  <h2 className="text-xl font-semibold mb-1">Personal Mensual</h2>
                  <div className="flex items-baseline justify-center gap-1">
                    <span className="text-4xl font-bold">$8.990</span>
                    <span className="text-white/80">/mes</span>
                  </div>
                  <p className="text-white/70 text-sm mt-1">IVA incluido</p>
                </div>

                {/* Features */}
                <div className="px-8 py-6 space-y-4">
                  <Feature icon={<FileText className="w-5 h-5" />} text="Hasta 50 análisis de PDF por mes" />
                  <Feature icon={<Users className="w-5 h-5" />} text="Hasta 500 intentos de estudiantes por mes" />
                  <Feature icon={<BarChart3 className="w-5 h-5" />} text="Corrección automática con IA" />
                  <Feature icon={<CreditCard className="w-5 h-5" />} text="Pago seguro con Flow (Webpay)" />
                  <Feature icon={<Check className="w-5 h-5" />} text="Cancela cuando quieras" />
                </div>

                {/* CTA */}
                <div className="px-8 pb-8">
                  {isActive ? (
                    <div className="text-center">
                      <div className="inline-flex items-center gap-2 bg-green-50 text-green-700 px-4 py-2 rounded-full text-sm font-medium mb-3">
                        <Check className="w-4 h-4" />
                        {subscription?.type === 'beta' ? 'Cuenta Beta' :
                         subscription?.type === 'institutional' ? 'Plan Institucional' :
                         'Suscripción Activa'}
                      </div>
                      {subscription?.periodEnd && (
                        <p className="text-sm text-gray-500">
                          Activa hasta {new Date(subscription.periodEnd).toLocaleDateString('es-CL')}
                        </p>
                      )}
                    </div>
                  ) : (
                    <button
                      onClick={handleSubscribe}
                      disabled={isSubscribing}
                      className="w-full btn-primary py-3 text-lg font-semibold disabled:opacity-50"
                    >
                      {isSubscribing ? 'Redirigiendo a Flow...' : 'Suscribirse'}
                    </button>
                  )}
                </div>
              </div>

              {/* Usage info */}
              {subscription?.usage && (
                <div className="max-w-md mx-auto mt-8 bg-white rounded-xl border border-gray-200 p-6">
                  <h3 className="text-sm font-semibold text-gray-700 mb-4">Uso este mes</h3>
                  <UsageBar
                    label="Intentos de estudiantes"
                    current={subscription.usage.studentAttempts}
                    limit={500}
                  />
                  <UsageBar
                    label="Análisis de PDF"
                    current={subscription.usage.pdfAnalyses}
                    limit={50}
                  />
                </div>
              )}

              {/* Institutional CTA */}
              <div className="max-w-md mx-auto mt-6 text-center">
                <p className="text-sm text-gray-500">
                  ¿Eres un colegio o institución?{' '}
                  <a href="mailto:contacto@aproba.ai" className="text-primary hover:underline font-medium">
                    Contáctanos para un plan institucional
                  </a>
                  {' '}($6.990/profesor/mes)
                </p>
              </div>

              {error && (
                <div className="max-w-md mx-auto mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}

function Feature({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="text-primary flex-shrink-0">{icon}</div>
      <span className="text-gray-700">{text}</span>
    </div>
  );
}

function UsageBar({ label, current, limit }: { label: string; current: number; limit: number }) {
  const pct = Math.min((current / limit) * 100, 100);
  const color = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-primary';

  return (
    <div className="mb-3 last:mb-0">
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-600">{label}</span>
        <span className="font-medium text-gray-800">{current}/{limit}</span>
      </div>
      <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
