'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import ProtectedRoute from '@/components/ProtectedRoute';
import Navbar from '@/components/Navbar';
import { testsAPI } from '@/lib/api';
import { Test } from '@/types';
import { ArrowLeft, Copy, CheckCircle, Share2, AlertCircle, Users, Monitor } from 'lucide-react';
import { ROUTES } from '@/config/constants';
import { QRCodeCanvas } from 'qrcode.react';

export default function ActivateTestPage() {
  const router = useRouter();
  const params = useParams();
  const testId = params.id as string;

  const [test, setTest] = useState<Test | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Cargar prueba
  useEffect(() => {
    loadTest();
  }, [testId]);

  const loadTest = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const data = await testsAPI.getById(testId);

      // Verificar que esté activada (revisar varios formatos posibles)
      const isActive = data.isActive ?? data.is_active;
      const status = (data as any).status; // El backend puede devolver "status": "ACTIVE"

      if (!isActive && status !== 'ACTIVE') {
        // Verificar si tiene curso asignado
        const courseId = data.courseId || data.course_id;
        if (!courseId) {
          setError('NO_COURSE');
        } else {
          setError('Esta prueba no está activada');
        }
        setTest(data);
        return;
      }

      setTest(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar la prueba');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyCode = async () => {
    const accessCode = test?.accessCode || test?.access_code;
    if (!accessCode) return;

    try {
      await navigator.clipboard.writeText(accessCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch (err) {
      console.error('Error al copiar:', err);
    }
  };

  const handleCopyLink = async () => {
    const accessCode = test?.accessCode || test?.access_code;
    if (!accessCode) return;

    // URL del estudiante (cambiar según tu dominio en producción)
    const studentUrl = `${window.location.origin}/prueba?codigo=${accessCode}`;

    try {
      await navigator.clipboard.writeText(studentUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch (err) {
      console.error('Error al copiar:', err);
    }
  };

  const handleBack = () => {
    router.push(ROUTES.DASHBOARD);
  };

  // ============================================
  // RENDER
  // ============================================

  if (isLoading) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-[#FBF9F3]">
          <Navbar />
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-gray-600">Cargando...</p>
            </div>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  // Error: No tiene curso asignado
  if (error === 'NO_COURSE') {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-[#FBF9F3]">
          <Navbar />
          <div className="max-w-3xl mx-auto px-6 py-8">
            <button
              onClick={handleBack}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
            >
              <ArrowLeft className="w-4 h-4" />
              Volver al Dashboard
            </button>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <AlertCircle className="w-6 h-6 text-amber-600" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-amber-900 mb-2">
                    Sin curso asignado
                  </h2>
                  <p className="text-amber-800 mb-4">
                    Esta prueba no puede ser activada porque no tiene un curso asignado.
                    Debes asignar un curso con estudiantes antes de poder activarla.
                  </p>
                  <div className="flex gap-3">
                    <Link
                      href={ROUTES.TEST_DETAIL(testId)}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-md hover:bg-amber-700"
                    >
                      <Users className="w-4 h-4" />
                      Asignar curso
                    </Link>
                    <Link
                      href={ROUTES.NEW_COURSE}
                      className="inline-flex items-center gap-2 px-4 py-2 border border-amber-600 text-amber-700 rounded-md hover:bg-amber-100"
                    >
                      Crear nuevo curso
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  // Otro error o prueba no encontrada
  if (error || !test) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-[#FBF9F3]">
          <Navbar />
          <div className="max-w-3xl mx-auto px-6 py-8">
            <button
              onClick={handleBack}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
            >
              <ArrowLeft className="w-4 h-4" />
              Volver al Dashboard
            </button>
            <div className="bg-red-50 border border-red-200 rounded-md p-4">
              <p className="text-red-600">{error || 'Prueba no encontrada'}</p>
            </div>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  const accessCode = test.accessCode || test.access_code || '';
  const studentUrl = `${window.location.origin}/prueba?codigo=${accessCode}`;

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-[#FBF9F3]">
        <Navbar />

        <div className="max-w-3xl mx-auto px-6 py-8">
          {/* Back Button */}
          <button
            onClick={handleBack}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver al Dashboard
          </button>

          {/* Success Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
              <CheckCircle className="w-10 h-10 text-green-600" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Prueba Activada
            </h1>
            <p className="text-gray-600">
              {test.title}
            </p>
          </div>

          {/* Course Info */}
          {test.course && (
            <div className="bg-blue-50 border border-blue-200 rounded-md p-4 mb-6">
              <div className="flex items-center gap-2 text-blue-800">
                <Users className="w-4 h-4" />
                <span className="font-medium">Curso:</span>
                <span>{test.course.name} ({test.course.year})</span>
                {test.course.students && (
                  <span className="text-blue-600">
                    • {test.course.students.length} estudiantes
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Main Card */}
          <div className="bg-white rounded-lg shadow-lg p-8 mb-6">

            {/* Access Code */}
            <div className="text-center mb-8">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Código de Acceso
              </label>
              <div className="inline-flex items-center gap-3 bg-gray-50 px-8 py-4 rounded-lg border-2 border-primary">
                <span className="text-4xl font-bold text-primary tracking-wider">
                  {accessCode}
                </span>
              </div>
              <button
                onClick={handleCopyCode}
                className="mt-4 flex items-center gap-2 mx-auto px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
              >
                {copiedCode ? (
                  <>
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    <span className="text-green-600">Copiado</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Copiar Código</span>
                  </>
                )}
              </button>
            </div>

            {/* QR Code */}
            <div className="text-center mb-8 pb-8 border-b border-gray-200">
              <label className="block text-sm font-medium text-gray-700 mb-4">
                Código QR
              </label>
              <div className="inline-block p-4 bg-white border-2 border-gray-200 rounded-lg">
                <QRCodeCanvas
                  value={studentUrl}
                  size={200}
                  level="H"
                  includeMargin={true}
                />
              </div>
              <p className="text-xs text-gray-500 mt-3">
                Los estudiantes pueden escanear este código para acceder directamente
              </p>
            </div>

            {/* Student Link */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Link para Estudiantes
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={studentUrl}
                  readOnly
                  className="flex-1 px-3 py-2 bg-gray-50 border border-gray-300 rounded-md text-gray-700 text-sm"
                />
                <button
                  onClick={handleCopyLink}
                  className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark transition-colors flex items-center gap-2"
                >
                  {copiedLink ? (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      Copiado
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      Copiar
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Instructions */}
            <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
              <div className="flex items-start gap-3">
                <Share2 className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-medium text-blue-900 mb-2">
                    Cómo compartir con tus estudiantes:
                  </h3>
                  <ul className="text-sm text-blue-800 space-y-1">
                    <li>• Proyecta el código QR en la sala de clases</li>
                    <li>• Comparte el código de 6 caracteres verbalmente</li>
                    <li>• Envía el link por email o plataforma educativa</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="font-semibold text-gray-900 mb-4">
              Información de la Prueba
            </h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-500">Total de preguntas</p>
                <p className="text-lg font-semibold text-gray-900">
                  {test.questions?.length || 0}
                </p>
              </div>
              <div>
                <p className="text-gray-500">Estado</p>
                <p className="text-lg font-semibold text-green-600">
                  Activa
                </p>
              </div>
            </div>

            {/* Botón de Monitoreo */}
            <div className="mt-6 pt-6 border-t border-gray-200">
              <Link
                href={ROUTES.TEST_MONITOR(testId)}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary text-white rounded-md hover:bg-primary-dark transition-colors font-medium"
              >
                <Monitor className="w-5 h-5" />
                Ver Monitor de Estudiantes
              </Link>
              <p className="text-xs text-gray-500 mt-2 text-center">
                Monitorea el progreso de tus estudiantes en tiempo real
              </p>
            </div>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
