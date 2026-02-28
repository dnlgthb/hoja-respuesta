'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { authAPI } from '@/lib/api';
import { ROUTES } from '@/config/constants';
import { CheckCircle, XCircle } from 'lucide-react';

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setErrorMsg('Token de verificación no proporcionado.');
      return;
    }

    authAPI.verifyEmail(token)
      .then(() => setStatus('success'))
      .catch((err) => {
        setStatus('error');
        setErrorMsg(err instanceof Error ? err.message : 'Error al verificar email');
      });
  }, [token]);

  if (status === 'loading') {
    return (
      <div className="text-center">
        <div className="w-16 h-16 border-4 border-[#14B8A6] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-gray-600">Verificando tu email...</p>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-8 h-8 text-green-600" />
        </div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Email verificado</h2>
        <p className="text-gray-600 mb-6">
          Tu cuenta ha sido verificada exitosamente.
        </p>
        <Link
          href={ROUTES.DASHBOARD}
          className="inline-flex items-center gap-2 btn-primary px-6 py-2.5"
        >
          Ir al dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="text-center">
      <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <XCircle className="w-8 h-8 text-red-600" />
      </div>
      <h2 className="text-xl font-semibold text-gray-900 mb-2">Error de verificación</h2>
      <p className="text-gray-600 mb-6">{errorMsg}</p>
      <Link
        href={ROUTES.LOGIN}
        className="inline-flex items-center gap-2 text-[#6366f1] hover:text-[#4f46e5] font-medium"
      >
        Ir al login
      </Link>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FBF9F3] px-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-2">
            <h1 className="logo-aproba text-4xl text-[#1F2937]">Aproba</h1>
            <CheckCircle className="w-7 h-7 text-[#14B8A6] -mt-2" strokeWidth={3} />
          </div>
        </div>

        {/* Card */}
        <div className="bg-white rounded-lg shadow-lg p-8">
          <Suspense fallback={<div className="text-center text-gray-500">Cargando...</div>}>
            <VerifyEmailContent />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
