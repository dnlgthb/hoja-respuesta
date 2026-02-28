'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { testsAPI } from '@/lib/api';
import { ROUTES } from '@/config/constants';
import {
  ArrowLeft,
  RefreshCw,
  Users,
  Clock,
  CheckCircle,
  AlertCircle,
  Unlock,
  UserX,
  StopCircle,
  Timer,
  Link as LinkIcon,
  Copy,
  ExternalLink,
} from 'lucide-react';
import type { MonitorStudent, TestAttemptsResponse } from '@/types';

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

export default function MonitorPage() {
  const params = useParams();
  const router = useRouter();
  const testId = params.id as string;

  const [data, setData] = useState<TestAttemptsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [unlockingId, setUnlockingId] = useState<string | null>(null);
  const [confirmUnlock, setConfirmUnlock] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Timer state
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Link copy state
  const [copiedLink, setCopiedLink] = useState(false);

  // Close test state
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isCorrecting, setIsCorrecting] = useState(false);
  const correctionPollRef = useRef<NodeJS.Timeout | null>(null);

  // Cargar datos
  const loadData = useCallback(async (showRefreshIndicator = false) => {
    try {
      if (showRefreshIndicator) setIsRefreshing(true);
      const response = await testsAPI.getAttempts(testId);
      setData(response);
      setError(null);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Error al cargar los datos');
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [testId]);

  // Cargar al montar
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Auto-refresh cada 30 segundos
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      loadData(true);
    }, 30000);

    return () => clearInterval(interval);
  }, [autoRefresh, loadData]);

  // Inicializar temporizador cuando se cargan los datos
  useEffect(() => {
    if (data?.test.timeRemainingSeconds !== null && data?.test.timeRemainingSeconds !== undefined) {
      setTimeRemaining(data.test.timeRemainingSeconds);
    }
  }, [data?.test.timeRemainingSeconds]);

  // Cuenta regresiva del temporizador
  useEffect(() => {
    if (timeRemaining === null || timeRemaining <= 0) return;

    timerRef.current = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev === null || prev <= 0) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [timeRemaining !== null]);

  // Cerrar prueba
  const handleCloseTest = async () => {
    try {
      setIsClosing(true);
      await testsAPI.close(testId);
      setShowCloseConfirm(false);
      setIsCorrecting(true); // Marcar que está corrigiendo
      await loadData();
      // Iniciar polling para verificar si la corrección terminó
      startCorrectionPolling();
    } catch (err) {
      if (err instanceof Error) {
        alert(err.message);
      }
    } finally {
      setIsClosing(false);
    }
  };

  // Polling para verificar estado de corrección
  const startCorrectionPolling = () => {
    // Limpiar polling anterior si existe
    if (correctionPollRef.current) {
      clearInterval(correctionPollRef.current);
    }

    // Polling cada 5 segundos
    correctionPollRef.current = setInterval(async () => {
      try {
        const response = await testsAPI.getAttempts(testId);
        setData(response);

        // Si la corrección terminó, detener polling
        if (response.test.correctionCompletedAt) {
          setIsCorrecting(false);
          if (correctionPollRef.current) {
            clearInterval(correctionPollRef.current);
            correctionPollRef.current = null;
          }
        }
      } catch (err) {
        console.error('Error polling correction status:', err);
      }
    }, 5000);
  };

  // Limpiar polling al desmontar
  useEffect(() => {
    return () => {
      if (correctionPollRef.current) {
        clearInterval(correctionPollRef.current);
      }
    };
  }, []);

  // Verificar si la prueba está cerrada pero la corrección no ha terminado
  useEffect(() => {
    if (data?.test.status === 'CLOSED' && !data?.test.correctionCompletedAt) {
      setIsCorrecting(true);
      startCorrectionPolling();
    } else if (data?.test.correctionCompletedAt) {
      setIsCorrecting(false);
    }
  }, [data?.test.status, data?.test.correctionCompletedAt]);

  // Formatear tiempo restante
  const formatTimeRemaining = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  // Desbloquear estudiante
  const handleUnlock = async (attemptId: string) => {
    try {
      setUnlockingId(attemptId);
      await testsAPI.unlockStudent(testId, attemptId);
      setConfirmUnlock(null);
      await loadData();
    } catch (err) {
      if (err instanceof Error) {
        alert(err.message);
      }
    } finally {
      setUnlockingId(null);
    }
  };

  // Obtener color y texto del estado
  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'NOT_STARTED':
        return { color: 'text-gray-500', bg: 'bg-gray-100', text: 'No iniciado', icon: UserX };
      case 'IN_PROGRESS':
        return { color: 'text-blue-600', bg: 'bg-blue-100', text: 'En progreso', icon: Clock };
      case 'SUBMITTED':
        return { color: 'text-green-600', bg: 'bg-green-100', text: 'Entregado', icon: CheckCircle };
      default:
        return { color: 'text-gray-500', bg: 'bg-gray-100', text: status, icon: AlertCircle };
    }
  };

  // Formatear fecha
  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#FBF9F3] flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Cargando monitoreo...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-[#FBF9F3] flex items-center justify-center px-4">
        <div className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Error</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button onClick={() => router.back()} className="btn-primary">
            Volver
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="min-h-screen bg-[#FBF9F3]">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.back()}
                className="p-2 hover:bg-gray-100 rounded-md transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </button>
              <div>
                <h1 className="text-lg font-bold text-gray-900">{data.test.title}</h1>
                <p className="text-sm text-gray-500">{data.test.courseName}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Timer - only show if test is active */}
              {data.test.status === 'ACTIVE' && timeRemaining !== null && (
                <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
                  timeRemaining <= 300 ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                }`}>
                  <Timer className="w-5 h-5" />
                  <span className="font-mono font-bold text-lg">
                    {formatTimeRemaining(timeRemaining)}
                  </span>
                </div>
              )}

              {/* Status badge */}
              {data.test.status === 'CLOSED' && (
                <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg">
                  <StopCircle className="w-4 h-4" />
                  <span className="font-medium">Prueba cerrada</span>
                </div>
              )}

              {/* Toggle auto-refresh */}
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  className="rounded border-gray-300 text-primary focus:ring-primary"
                />
                Auto-refresh
              </label>

              {/* Refresh button */}
              <button
                onClick={() => loadData(true)}
                disabled={isRefreshing}
                className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                Actualizar
              </button>

              {/* Close test button - only show if active */}
              {data.test.status === 'ACTIVE' && (
                <button
                  onClick={() => setShowCloseConfirm(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
                >
                  <StopCircle className="w-4 h-4" />
                  Cerrar Prueba
                </button>
              )}

              {/* Go to results button - only show if closed */}
              {data.test.status === 'CLOSED' && (
                <button
                  onClick={() => router.push(ROUTES.TEST_RESULTS(testId))}
                  disabled={isCorrecting}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${
                    isCorrecting
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-primary text-white hover:bg-primary-dark'
                  }`}
                >
                  {isCorrecting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Corrigiendo...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      Ver Resultados
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Contenido */}
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Resumen */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gray-100 rounded-lg">
                <UserX className="w-5 h-5 text-gray-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{data.summary.notStarted}</p>
                <p className="text-sm text-gray-500">No iniciado</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Clock className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-blue-600">{data.summary.inProgress}</p>
                <p className="text-sm text-gray-500">En progreso</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-green-600">{data.summary.submitted}</p>
                <p className="text-sm text-gray-500">Entregado</p>
              </div>
            </div>
          </div>
        </div>

        {/* Link de acceso — solo si la prueba está activa */}
        {data.test.accessCode && (
          <div className="bg-white rounded-lg shadow p-4 mb-6 flex items-center gap-4">
            <LinkIcon className="w-5 h-5 text-gray-500 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-500 mb-1">Link para estudiantes</p>
              <p className="text-sm font-mono text-gray-700 truncate">
                {typeof window !== 'undefined'
                  ? `${window.location.origin}/prueba?codigo=${data.test.accessCode}`
                  : ''}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-sm font-bold text-gray-900 bg-gray-100 px-3 py-1 rounded">
                {data.test.accessCode}
              </span>
              <button
                onClick={() => {
                  const url = `${window.location.origin}/prueba?codigo=${data.test.accessCode}`;
                  navigator.clipboard.writeText(url);
                  setCopiedLink(true);
                  setTimeout(() => setCopiedLink(false), 2000);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
              >
                {copiedLink ? (
                  <>
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    <span className="text-green-600">Copiado</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Copiar link</span>
                  </>
                )}
              </button>
              <button
                onClick={() => router.push(ROUTES.TEST_ACTIVATE(testId))}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
                title="Ver página con código QR"
              >
                <ExternalLink className="w-4 h-4" />
                <span>QR</span>
              </button>
            </div>
          </div>
        )}

        {/* Tabla de estudiantes */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-2">
            <Users className="w-5 h-5 text-gray-600" />
            <h2 className="font-semibold text-gray-900">
              Estudiantes ({data.test.totalStudents})
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Estudiante
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Estado
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Respuestas
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Última actividad
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Entregado
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.students.map((student) => {
                  const statusInfo = getStatusInfo(student.status);
                  const StatusIcon = statusInfo.icon;

                  return (
                    <tr key={student.courseStudentId} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium text-gray-900">{student.studentName}</p>
                          {student.studentEmail && (
                            <p className="text-xs text-gray-500">{student.studentEmail}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusInfo.bg} ${statusInfo.color}`}>
                          <StatusIcon className="w-3.5 h-3.5" />
                          {statusInfo.text}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {student.answersCount > 0 ? student.answersCount : '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {formatTime(student.lastActivity)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {formatTime(student.submittedAt)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {student.status === 'IN_PROGRESS' && student.attemptId && (
                          <>
                            {confirmUnlock === student.attemptId ? (
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => setConfirmUnlock(null)}
                                  className="px-2 py-1 text-xs text-gray-600 hover:text-gray-800"
                                >
                                  Cancelar
                                </button>
                                <button
                                  onClick={() => handleUnlock(student.attemptId!)}
                                  disabled={unlockingId === student.attemptId}
                                  className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                                >
                                  {unlockingId === student.attemptId ? 'Desbloqueando...' : 'Confirmar'}
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setConfirmUnlock(student.attemptId!)}
                                className="inline-flex items-center gap-1 px-2 py-1 text-xs text-orange-600 hover:text-orange-800 hover:bg-orange-50 rounded transition-colors"
                              >
                                <Unlock className="w-3.5 h-3.5" />
                                Desbloquear
                              </button>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {data.students.length === 0 && (
            <div className="px-4 py-12 text-center text-gray-500">
              No hay estudiantes en este curso
            </div>
          )}
        </div>

        {/* Info */}
        <p className="mt-4 text-sm text-gray-500 text-center">
          La página se actualiza automáticamente cada 30 segundos
        </p>
      </div>

      {/* Modal de confirmación de cierre */}
      {showCloseConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-100 rounded-full">
                <StopCircle className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">
                Cerrar Prueba
              </h3>
            </div>

            <p className="text-gray-600 mb-6">
              ¿Estás seguro de que deseas cerrar esta prueba? Esta acción:
            </p>
            <ul className="text-sm text-gray-600 mb-6 space-y-2">
              <li className="flex items-start gap-2">
                <span className="text-red-500 mt-0.5">•</span>
                <span>Impedirá que nuevos estudiantes ingresen</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-500 mt-0.5">•</span>
                <span>Entregará automáticamente las pruebas de estudiantes que aún estén respondiendo</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-500 mt-0.5">•</span>
                <span>Iniciará el proceso de corrección</span>
              </li>
            </ul>

            <div className="flex gap-3">
              <button
                onClick={() => setShowCloseConfirm(false)}
                disabled={isClosing}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleCloseTest}
                disabled={isClosing}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
              >
                {isClosing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Cerrando...
                  </>
                ) : (
                  <>
                    <StopCircle className="w-4 h-4" />
                    Cerrar Prueba
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
