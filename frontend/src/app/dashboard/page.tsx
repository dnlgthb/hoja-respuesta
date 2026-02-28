'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import ProtectedRoute from '@/components/ProtectedRoute';
import Navbar from '@/components/Navbar';
import SubscriptionBanner from '@/components/SubscriptionBanner';
import TestCard from '@/components/TestCard';
import { testsAPI, authAPI } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth';
import { Test } from '@/types';
import { Plus, AlertTriangle } from 'lucide-react';
import { ROUTES } from '@/config/constants';

export default function DashboardPage() {
  const router = useRouter();
  const [tests, setTests] = useState<Test[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isVerified, setIsVerified] = useState(true);
  const [resendingVerification, setResendingVerification] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);

  // Cargar pruebas al montar el componente
  useEffect(() => {
    loadTests();
    // Check verification status
    const user = getCurrentUser();
    if (user && user.is_verified === false) {
      setIsVerified(false);
    }
  }, []);

  const loadTests = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await testsAPI.list();
      setTests(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar las pruebas');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteTest = async (id: string) => {
    try {
      await testsAPI.delete(id);
      // Recargar lista después de eliminar
      await loadTests();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al eliminar la prueba');
    }
  };

  const handleDuplicateTest = async (id: string) => {
    try {
      await testsAPI.duplicate(id);
      // Recargar lista después de duplicar
      await loadTests();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al duplicar la prueba');
    }
  };

  const handleNewTest = () => {
    router.push(ROUTES.NEW_TEST);
  };

  const handleResendVerification = async () => {
    try {
      setResendingVerification(true);
      await authAPI.resendVerification();
      setVerificationSent(true);
    } catch {
      // Silently fail
    } finally {
      setResendingVerification(false);
    }
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-[#FBF9F3]">
        <Navbar />
        <SubscriptionBanner />

        {/* Verification banner */}
        {!isVerified && (
          <div className="bg-amber-50 border-b border-amber-200">
            <div className="max-w-7xl mx-auto px-6 py-3 flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
              <p className="text-sm text-amber-800 flex-1">
                Tu email no está verificado. Revisa tu bandeja de entrada.
              </p>
              {verificationSent ? (
                <span className="text-sm text-green-700 font-medium">Enviado</span>
              ) : (
                <button
                  onClick={handleResendVerification}
                  disabled={resendingVerification}
                  className="text-sm text-amber-700 hover:text-amber-900 font-medium underline disabled:opacity-50"
                >
                  {resendingVerification ? 'Enviando...' : 'Reenviar email'}
                </button>
              )}
            </div>
          </div>
        )}

        <div className="max-w-7xl mx-auto px-6 py-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-bold text-gray-900">Mis Pruebas</h2>
            <button
              onClick={handleNewTest}
              className="flex items-center gap-2 btn-primary px-6 py-3"
            >
              <Plus className="w-5 h-5" />
              Nueva Prueba
            </button>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* Loading State */}
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-gray-600">Cargando pruebas...</p>
              </div>
            </div>
          )}

          {/* Empty State */}
          {!isLoading && !error && tests.length === 0 && (
            <div className="text-center py-12">
              <div className="mb-4">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Plus className="w-8 h-8 text-gray-400" />
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  No tienes pruebas aún
                </h3>
                <p className="text-gray-600 mb-6">
                  Comienza creando tu primera prueba
                </p>
                <button
                  onClick={handleNewTest}
                  className="btn-primary px-6 py-3"
                >
                  Crear Primera Prueba
                </button>
              </div>
            </div>
          )}

          {/* Tests Grid */}
          {!isLoading && !error && tests.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {tests.map((test) => (
                <TestCard
                  key={test.id}
                  test={test}
                  onDelete={handleDeleteTest}
                  onDuplicate={handleDuplicateTest}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
