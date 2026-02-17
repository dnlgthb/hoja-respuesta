'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { studentAPI } from '@/lib/api';
import { FileText, Search, AlertTriangle, CheckCircle2, ArrowLeft, User, Mail } from 'lucide-react';
import type { AvailableStudent } from '@/types';

// ============================================
// CONSTANTES
// ============================================

const DEVICE_TOKEN_KEY = 'device_token';

// ============================================
// TIPOS
// ============================================

type Step = 'code' | 'select' | 'confirm';

interface TestInfo {
  id: string;
  title: string;
  courseName: string;
}

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

export default function PruebaPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[#FBF9F3]">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <PruebaContent />
    </Suspense>
  );
}

function PruebaContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Estados principales
  const [step, setStep] = useState<Step>('code');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deviceToken, setDeviceToken] = useState<string | null>(null);

  // Paso 1: Código de acceso
  const [accessCode, setAccessCode] = useState('');

  // Paso 2: Selección de estudiante
  const [testInfo, setTestInfo] = useState<TestInfo | null>(null);
  const [students, setStudents] = useState<AvailableStudent[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<AvailableStudent | null>(null);

  // Paso 3: Confirmación
  const [confirmText, setConfirmText] = useState('');
  const [studentEmail, setStudentEmail] = useState('');

  // Cargar deviceToken de localStorage al montar
  useEffect(() => {
    const storedToken = localStorage.getItem(DEVICE_TOKEN_KEY);
    if (storedToken) {
      setDeviceToken(storedToken);
    }
  }, []);

  // Leer código desde query param
  useEffect(() => {
    const codigoFromUrl = searchParams.get('codigo');
    if (codigoFromUrl) {
      const cleanCode = codigoFromUrl.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
      setAccessCode(cleanCode);
    }
  }, [searchParams]);

  // Filtrar estudiantes disponibles
  const filteredStudents = useMemo(() => {
    if (!searchQuery.trim()) return students;
    const query = searchQuery.toLowerCase();
    return students.filter(s => s.studentName.toLowerCase().includes(query));
  }, [students, searchQuery]);

  // Estudiantes disponibles (sin intento)
  const availableStudents = useMemo(() => {
    return filteredStudents.filter(s => !s.hasAttempt);
  }, [filteredStudents]);

  // Estudiantes ya ingresados
  const takenStudents = useMemo(() => {
    return filteredStudents.filter(s => s.hasAttempt);
  }, [filteredStudents]);

  // ============================================
  // HANDLERS
  // ============================================

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    setAccessCode(value);
    setError(null);
  };

  const handleSubmitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (accessCode.length !== 6) {
      setError('El código debe tener 6 caracteres');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const response = await studentAPI.getAvailableStudents(accessCode);

      setTestInfo(response.test);
      setStudents(response.students);
      setStep('select');

    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Error al verificar el código');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectStudent = (student: AvailableStudent) => {
    if (student.hasAttempt) return;
    setSelectedStudent(student);
    setStep('confirm');
    setConfirmText('');
    setStudentEmail('');
  };

  const handleBackToSelect = () => {
    setStep('select');
    setSelectedStudent(null);
    setConfirmText('');
    setError(null);
  };

  const handleBackToCode = () => {
    setStep('code');
    setTestInfo(null);
    setStudents([]);
    setSelectedStudent(null);
    setSearchQuery('');
    setError(null);
  };

  const handleConfirm = async () => {
    if (!selectedStudent || confirmText !== 'CONFIRMO') return;

    try {
      setIsLoading(true);
      setError(null);

      const response = await studentAPI.join({
        accessCode,
        courseStudentId: selectedStudent.id,
        deviceToken: deviceToken || undefined,
        studentEmail: studentEmail.trim() || undefined,
      });

      // Guardar deviceToken en localStorage
      localStorage.setItem(DEVICE_TOKEN_KEY, response.deviceToken);

      // Redirigir a la prueba
      router.push(`/prueba/${response.attemptId}`);

    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Error al ingresar a la prueba');
      }
      setIsLoading(false);
    }
  };

  // ============================================
  // RENDER PASO 1: CÓDIGO DE ACCESO
  // ============================================

  if (step === 'code') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FBF9F3] px-4 py-8">
        <div className="w-full max-w-md">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-primary/10 rounded-full mb-4">
              <FileText className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Ingresar a Prueba
            </h1>
            <p className="text-gray-600">
              Ingresa el código proporcionado por tu profesor
            </p>
          </div>

          {/* Card */}
          <div className="bg-white rounded-lg shadow-lg p-6 sm:p-8">
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmitCode} className="space-y-5">
              <div>
                <label htmlFor="accessCode" className="block text-sm font-medium text-gray-700 mb-1">
                  Código de acceso
                </label>
                <input
                  id="accessCode"
                  type="text"
                  value={accessCode}
                  onChange={handleCodeChange}
                  className="w-full px-3 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-gray-900 text-center text-2xl tracking-widest font-mono uppercase"
                  placeholder="ABC123"
                  maxLength={6}
                  autoComplete="off"
                  autoFocus
                />
              </div>

              <button
                type="submit"
                disabled={isLoading || accessCode.length !== 6}
                className="w-full btn-primary py-3 text-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Verificando...
                  </>
                ) : (
                  'Continuar'
                )}
              </button>
            </form>

            {deviceToken && (
              <p className="mt-4 text-xs text-center text-gray-500">
                Si ya iniciaste esta prueba, se recuperará tu progreso automáticamente.
              </p>
            )}
          </div>

          <p className="text-center text-xs text-gray-400 mt-6">
            Aproba - Plataforma de evaluaciones digitales
          </p>
        </div>
      </div>
    );
  }

  // ============================================
  // RENDER PASO 2: SELECCIÓN DE ESTUDIANTE
  // ============================================

  if (step === 'select') {
    const allTaken = availableStudents.length === 0 && students.length > 0;

    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FBF9F3] px-4 py-8">
        <div className="w-full max-w-lg">
          {/* Header */}
          <div className="text-center mb-6">
            <h1 className="text-xl font-bold text-gray-900 mb-1">
              {testInfo?.title}
            </h1>
            <p className="text-gray-600 text-sm">
              {testInfo?.courseName}
            </p>
          </div>

          {/* Card */}
          <div className="bg-white rounded-lg shadow-lg p-6">
            <button
              onClick={handleBackToCode}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
            >
              <ArrowLeft className="w-4 h-4" />
              Cambiar código
            </button>

            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Selecciona tu nombre
            </h2>

            {/* Buscador */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-gray-900"
                placeholder="Buscar por nombre..."
                autoFocus
              />
            </div>

            {/* Mensaje si todos están tomados */}
            {allTaken && (
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-md mb-4">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-yellow-800">
                      Todos los nombres ya fueron tomados
                    </p>
                    <p className="text-sm text-yellow-700 mt-1">
                      Si necesitas ingresar, contacta a tu profesor para que desbloquee tu nombre.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Lista de estudiantes */}
            <div className="max-h-80 overflow-y-auto border border-gray-200 rounded-md divide-y divide-gray-100">
              {/* Estudiantes disponibles */}
              {availableStudents.map((student) => (
                <button
                  key={student.id}
                  onClick={() => handleSelectStudent(student)}
                  className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center gap-3 transition-colors"
                >
                  <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                    <User className="w-4 h-4 text-primary" />
                  </div>
                  <span className="text-gray-900 font-medium">{student.studentName}</span>
                </button>
              ))}

              {/* Estudiantes ya ingresados */}
              {takenStudents.map((student) => (
                <div
                  key={student.id}
                  className="w-full px-4 py-3 flex items-center gap-3 bg-gray-50 cursor-not-allowed"
                >
                  <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center flex-shrink-0">
                    <User className="w-4 h-4 text-gray-400" />
                  </div>
                  <span className="text-gray-400">{student.studentName}</span>
                  <span className="text-xs text-gray-400 ml-auto">
                    {student.attemptStatus === 'SUBMITTED' ? '(entregado)' : '(ya ingresó)'}
                  </span>
                </div>
              ))}

              {/* Sin resultados */}
              {filteredStudents.length === 0 && (
                <div className="px-4 py-8 text-center text-gray-500">
                  No se encontraron estudiantes con ese nombre
                </div>
              )}
            </div>

            <p className="mt-4 text-xs text-gray-500 text-center">
              {students.length} estudiantes en el curso
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ============================================
  // RENDER PASO 3: CONFIRMACIÓN
  // ============================================

  if (step === 'confirm' && selectedStudent) {
    const isConfirmValid = confirmText === 'CONFIRMO';

    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FBF9F3] px-4 py-8">
        <div className="w-full max-w-md">
          {/* Card */}
          <div className="bg-white rounded-lg shadow-lg p-6 sm:p-8">
            <button
              onClick={handleBackToSelect}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6"
            >
              <ArrowLeft className="w-4 h-4" />
              Volver
            </button>

            {/* Icono de confirmación */}
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-primary/10 rounded-full mb-4">
                <CheckCircle2 className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">
                Confirma tu identidad
              </h2>
            </div>

            {/* Nombre seleccionado */}
            <div className="bg-gray-50 rounded-lg p-4 mb-6 text-center">
              <p className="text-sm text-gray-500 mb-1">Vas a ingresar como:</p>
              <p className="text-xl font-bold text-gray-900">{selectedStudent.studentName}</p>
            </div>

            {/* Advertencia */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4 mb-6">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-yellow-800">
                    Esta acción no se puede deshacer
                  </p>
                  <p className="text-sm text-yellow-700 mt-1">
                    Una vez confirmado, no podrás cambiar tu nombre. Si te equivocas, deberás contactar a tu profesor.
                  </p>
                </div>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            {/* Input de email */}
            <div className="mb-4">
              <label htmlFor="studentEmail" className="block text-sm font-medium text-gray-700 mb-2">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4" />
                  <span>Tu correo electrónico (opcional)</span>
                </div>
              </label>
              <input
                id="studentEmail"
                type="email"
                value={studentEmail}
                onChange={(e) => setStudentEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-gray-900"
                placeholder="tu@correo.com"
                autoComplete="email"
              />
              <p className="text-xs text-gray-500 mt-1">
                Ingresa tu correo si quieres recibir los resultados por email
              </p>
            </div>

            {/* Input de confirmación */}
            <div className="mb-6">
              <label htmlFor="confirmText" className="block text-sm font-medium text-gray-700 mb-2">
                Escribe <span className="font-bold">CONFIRMO</span> para continuar:
              </label>
              <input
                id="confirmText"
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-gray-900 text-center font-mono tracking-wider"
                placeholder="CONFIRMO"
                autoComplete="off"
              />
            </div>

            {/* Botón de confirmación */}
            <button
              onClick={handleConfirm}
              disabled={isLoading || !isConfirmValid}
              className="w-full btn-primary py-3 text-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Ingresando...
                </>
              ) : (
                'Ingresar a la prueba'
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
