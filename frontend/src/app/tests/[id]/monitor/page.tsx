'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { testsAPI } from '@/lib/api';
import {
  ArrowLeft,
  RefreshCw,
  Users,
  Clock,
  CheckCircle,
  AlertCircle,
  Unlock,
  UserX,
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
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
    <div className="min-h-screen bg-gray-50">
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
    </div>
  );
}
