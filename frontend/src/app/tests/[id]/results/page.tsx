'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { testsAPI } from '@/lib/api';
import ProtectedRoute from '@/components/ProtectedRoute';
import Navbar from '@/components/Navbar';
import { ROUTES } from '@/config/constants';
import {
  ArrowLeft,
  RefreshCw,
  Users,
  CheckCircle,
  AlertCircle,
  Edit,
  Save,
  X,
  ChevronDown,
  ChevronUp,
  Mail,
  Download,
  Award,
  TrendingUp,
  FileText,
} from 'lucide-react';
import MathDisplay from '@/components/MathDisplay';
import RichMathText from '@/components/RichMathText';

// ============================================
// TIPOS
// ============================================

interface AnswerResult {
  id: string;
  questionId: string;
  questionNumber: number;
  questionText: string;
  questionType: string;
  maxPoints: number;
  correctAnswer: string | null;
  correctionCriteria: string | null;
  answerValue: string | null;
  justification?: string | null;
  pointsEarned: number | null;
  aiFeedback: string | null;
}

interface StudentResult {
  id: string;
  studentName: string;
  studentEmail: string | null;
  resultsToken: string;
  submittedAt: string | null;
  reviewedAt: string | null;
  resultsSentAt: string | null;
  totalPoints: number;
  maxPoints: number;
  percentage: number;
  grade: number;
  passed: boolean;
  answers: AnswerResult[];
  // Nuevos campos para ortografía/redacción y paste
  spellingScore?: number | null;
  writingScore?: number | null;
  spellingWritingFeedback?: string | null;
  pasteAttempts?: number;
}

interface ResultsSummary {
  totalStudents: number;
  averageScore: number;
  maxScore: number;
  minScore: number;
  maxPossiblePoints: number;
  reviewedCount: number;
  sentCount: number;
  // Estadísticas de notas
  averageGrade: number;
  maxGrade: number;
  minGrade: number;
  passedCount: number;
  failedCount: number;
  passRate: number;
}

interface ResultsData {
  test: {
    id: string;
    title: string;
    status: string;
    course: { id: string; name: string; year: number } | null;
    questionsCount: number;
    closedAt: string | null;
    passingThreshold: number;
    correctionCompletedAt: string | null;
  };
  students: StudentResult[];
  summary: ResultsSummary;
}

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

export default function ResultsPage() {
  const params = useParams();
  const router = useRouter();
  const testId = params.id as string;

  const [data, setData] = useState<ResultsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedStudent, setExpandedStudent] = useState<string | null>(null);
  const [editingAnswer, setEditingAnswer] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{ points: number; feedback: string }>({ points: 0, feedback: '' });
  const [isSaving, setIsSaving] = useState(false);
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [isSendingEmails, setIsSendingEmails] = useState(false);
  const [showSendConfirm, setShowSendConfirm] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [showCriteriaModal, setShowCriteriaModal] = useState<{ questionNumber: number; criteria: string } | null>(null);
  const [passingThreshold, setPassingThreshold] = useState(60);
  const [isSavingThreshold, setIsSavingThreshold] = useState(false);
  const [includeGradeInEmail, setIncludeGradeInEmail] = useState(true);

  // Cargar datos
  const loadData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const results = await testsAPI.getResults(testId);
      setData(results);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar los resultados');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [testId]);

  // Inicializar exigencia cuando se cargan los datos
  useEffect(() => {
    if (data?.test.passingThreshold) {
      setPassingThreshold(data.test.passingThreshold);
    }
  }, [data?.test.passingThreshold]);

  // Función para calcular nota chilena localmente
  const calculateGrade = (percentage: number, threshold: number): { grade: number; passed: boolean } => {
    let grade: number;
    if (percentage >= threshold) {
      grade = 4.0 + ((percentage - threshold) * 3.0) / (100 - threshold);
    } else {
      grade = 1.0 + (percentage * 3.0) / threshold;
    }
    grade = Math.round(grade * 10) / 10;
    grade = Math.max(1.0, Math.min(7.0, grade));
    return { grade, passed: grade >= 4.0 };
  };

  // Guardar exigencia en el servidor
  const savePassingThreshold = async (newThreshold: number) => {
    try {
      setIsSavingThreshold(true);
      await testsAPI.updatePassingThreshold(testId, newThreshold);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al guardar la exigencia');
    } finally {
      setIsSavingThreshold(false);
    }
  };

  // Toggle selección de estudiante
  const toggleStudentSelection = (studentId: string) => {
    setSelectedStudents(prev => {
      const newSet = new Set(prev);
      if (newSet.has(studentId)) {
        newSet.delete(studentId);
      } else {
        newSet.add(studentId);
      }
      return newSet;
    });
  };

  // Seleccionar/deseleccionar todos
  const toggleSelectAll = () => {
    if (selectedStudents.size === data?.students.length) {
      setSelectedStudents(new Set());
    } else {
      setSelectedStudents(new Set(data?.students.map(s => s.id) || []));
    }
  };

  // Abrir edición de respuesta
  const startEditAnswer = (answer: AnswerResult) => {
    setEditingAnswer(answer.id);
    setEditValues({
      points: answer.pointsEarned ?? 0,
      feedback: answer.aiFeedback || '',
    });
  };

  // Guardar edición de respuesta
  const saveAnswerEdit = async (answerId: string) => {
    try {
      setIsSaving(true);
      await testsAPI.updateAnswer(testId, answerId, {
        pointsEarned: editValues.points,
        aiFeedback: editValues.feedback,
      });
      setEditingAnswer(null);
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setIsSaving(false);
    }
  };

  // Marcar como revisado
  const markAsReviewed = async (attemptId: string) => {
    try {
      await testsAPI.markReviewed(testId, attemptId);
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al marcar como revisado');
    }
  };

  // Exportar a Excel
  const exportToExcel = async () => {
    try {
      setIsExporting(true);
      const token = localStorage.getItem('auth_token');

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/tests/${testId}/export`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Error al exportar');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `resultados-${data?.test.title || testId}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al exportar');
    } finally {
      setIsExporting(false);
    }
  };

  // Enviar resultados por email
  const sendResultsEmails = async () => {
    try {
      setIsSendingEmails(true);
      const ids = selectedStudents.size > 0 ? Array.from(selectedStudents) : undefined;
      const result = await testsAPI.sendResults(testId, ids, includeGradeInEmail);

      setShowSendConfirm(false);
      setSelectedStudents(new Set());

      // Mostrar resultado
      if (result.sent > 0) {
        alert(`Emails enviados: ${result.sent}\n${result.failed > 0 ? `Fallidos: ${result.failed}\n${result.errors.join('\n')}` : ''}`);
      } else {
        alert(`No se pudieron enviar emails.\n${result.errors.join('\n')}`);
      }

      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al enviar emails');
    } finally {
      setIsSendingEmails(false);
    }
  };

  // Obtener color por porcentaje
  const getScoreColor = (percentage: number): string => {
    if (percentage >= 80) return 'text-green-600';
    if (percentage >= 60) return 'text-blue-600';
    if (percentage >= 40) return 'text-yellow-600';
    return 'text-red-600';
  };

  // Formatear tipo de pregunta
  const formatQuestionType = (type: string): string => {
    const types: Record<string, string> = {
      TRUE_FALSE: 'V/F',
      MULTIPLE_CHOICE: 'Opción Múltiple',
      DEVELOPMENT: 'Desarrollo',
      MATH: 'Matemática',
    };
    return types[type] || type;
  };

  // ============================================
  // RENDER - Loading
  // ============================================

  if (isLoading) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-[#FBF9F3]">
          <Navbar />
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-gray-600">Cargando resultados...</p>
            </div>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  // ============================================
  // RENDER - Error
  // ============================================

  if (error || !data) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-[#FBF9F3]">
          <Navbar />
          <div className="max-w-4xl mx-auto px-6 py-8">
            <button
              onClick={() => router.back()}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
            >
              <ArrowLeft className="w-4 h-4" />
              Volver
            </button>
            <div className="bg-red-50 border border-red-200 rounded-md p-4">
              <div className="flex items-center gap-2 text-red-600">
                <AlertCircle className="w-5 h-5" />
                <p>{error || 'No se pudieron cargar los resultados'}</p>
              </div>
            </div>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  // ============================================
  // RENDER - Resultados
  // ============================================

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-[#FBF9F3]">
        <Navbar />

        <div className="max-w-7xl mx-auto px-6 py-8">
          {/* Header */}
          <div className="flex items-start justify-between mb-6">
            <div>
              <button
                onClick={() => router.push(ROUTES.DASHBOARD)}
                className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
              >
                <ArrowLeft className="w-4 h-4" />
                Volver al Dashboard
              </button>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                Resultados: {data.test.title}
              </h1>
              {data.test.course && (
                <p className="text-gray-600">
                  {data.test.course.name} ({data.test.course.year})
                </p>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={loadData}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-md"
              >
                <RefreshCw className="w-4 h-4" />
                Actualizar
              </button>
              <button
                onClick={exportToExcel}
                disabled={isExporting}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
              >
                {isExporting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Exportando...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    Exportar Excel
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Control de Exigencia */}
          <div className="bg-white rounded-lg shadow p-4 mb-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-4">
                <label className="text-sm font-medium text-gray-700">
                  Exigencia (% para nota 4.0):
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="50"
                    max="70"
                    step="1"
                    value={passingThreshold}
                    onChange={(e) => setPassingThreshold(Number(e.target.value))}
                    onMouseUp={() => savePassingThreshold(passingThreshold)}
                    onTouchEnd={() => savePassingThreshold(passingThreshold)}
                    className="w-32 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                  <span className="text-lg font-bold text-gray-900 w-12">{passingThreshold}%</span>
                  {isSavingThreshold && (
                    <RefreshCw className="w-4 h-4 animate-spin text-gray-400" />
                  )}
                </div>
              </div>
              <div className="text-sm text-gray-500">
                Nota 4.0 = {passingThreshold}% de logro | Notas se recalculan automáticamente
              </div>
            </div>
          </div>

          {/* Resumen estadístico */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Users className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{data.summary.totalStudents}</p>
                  <p className="text-sm text-gray-500">Estudiantes</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <TrendingUp className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">
                    {data.summary.averageScore}/{data.summary.maxPossiblePoints}
                  </p>
                  <p className="text-sm text-gray-500">Promedio pts</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-yellow-100 rounded-lg">
                  <Award className="w-5 h-5 text-yellow-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">
                    {(() => {
                      const grades = data.students.map(s => calculateGrade(s.percentage, passingThreshold).grade);
                      return grades.length > 0 ? (grades.reduce((a, b) => a + b, 0) / grades.length).toFixed(1) : '-';
                    })()}
                  </p>
                  <p className="text-sm text-gray-500">Promedio notas</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-green-600">
                    {data.students.filter(s => calculateGrade(s.percentage, passingThreshold).passed).length}
                  </p>
                  <p className="text-sm text-gray-500">Aprobados</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-100 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-red-600">
                    {data.students.filter(s => !calculateGrade(s.percentage, passingThreshold).passed).length}
                  </p>
                  <p className="text-sm text-gray-500">Reprobados</p>
                </div>
              </div>
            </div>
          </div>

          {/* Acciones de email */}
          {selectedStudents.size > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 flex items-center justify-between">
              <p className="text-blue-800">
                {selectedStudents.size} estudiante(s) seleccionado(s)
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setSelectedStudents(new Set())}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => setShowSendConfirm(true)}
                  disabled={isSendingEmails}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  <Mail className="w-4 h-4" />
                  Enviar resultados por email
                </button>
              </div>
            </div>
          )}

          {/* Botón para enviar a todos */}
          {selectedStudents.size === 0 && data.students.length > 0 && (
            <div className="flex justify-end mb-6">
              <button
                onClick={() => setShowSendConfirm(true)}
                disabled={isSendingEmails}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                <Mail className="w-4 h-4" />
                Enviar resultados a todos
              </button>
            </div>
          )}

          {/* Lista de estudiantes */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-gray-600" />
                <h2 className="font-semibold text-gray-900">
                  Resultados por estudiante
                </h2>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedStudents.size === data.students.length}
                  onChange={toggleSelectAll}
                  className="rounded border-gray-300 text-primary focus:ring-primary"
                />
                Seleccionar todos
              </label>
            </div>

            <div className="divide-y divide-gray-100">
              {data.students.map((student) => (
                <div key={student.id} className="hover:bg-gray-50">
                  {/* Fila principal del estudiante */}
                  <div className="px-4 py-3 flex items-center gap-4">
                    <input
                      type="checkbox"
                      checked={selectedStudents.has(student.id)}
                      onChange={() => toggleStudentSelection(student.id)}
                      className="rounded border-gray-300 text-primary focus:ring-primary"
                    />

                    <button
                      onClick={() => setExpandedStudent(expandedStudent === student.id ? null : student.id)}
                      className="flex-1 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <div>
                          <p className="font-medium text-gray-900">{student.studentName}</p>
                          {student.studentEmail && (
                            <p className="text-xs text-gray-500">{student.studentEmail}</p>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          {student.reviewedAt && (
                            <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full flex items-center gap-1">
                              <CheckCircle className="w-3 h-3" />
                              Revisado
                            </span>
                          )}
                          {student.resultsSentAt && (
                            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full flex items-center gap-1">
                              <Mail className="w-3 h-3" />
                              Enviado
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className="flex items-center gap-3">
                            <div>
                              <p className={`text-lg font-bold ${getScoreColor(student.percentage)}`}>
                                {student.totalPoints}/{student.maxPoints}
                              </p>
                              <p className="text-xs text-gray-500">{student.percentage}%</p>
                            </div>
                            <div className="border-l border-gray-200 pl-3">
                              {(() => {
                                const { grade, passed } = calculateGrade(student.percentage, passingThreshold);
                                return (
                                  <>
                                    <p className={`text-lg font-bold ${passed ? 'text-green-600' : 'text-red-600'}`}>
                                      {grade.toFixed(1)}
                                    </p>
                                    <p className={`text-xs ${passed ? 'text-green-500' : 'text-red-500'}`}>
                                      {passed ? 'Aprobado' : 'Reprobado'}
                                    </p>
                                  </>
                                );
                              })()}
                            </div>
                          </div>
                        </div>
                        {expandedStudent === student.id ? (
                          <ChevronUp className="w-5 h-5 text-gray-400" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-gray-400" />
                        )}
                      </div>
                    </button>
                  </div>

                  {/* Detalle expandido */}
                  {expandedStudent === student.id && (
                    <div className="px-4 py-4 bg-gray-50 border-t border-gray-100">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="font-medium text-gray-900">Respuestas</h3>
                        {!student.reviewedAt && (
                          <button
                            onClick={() => markAsReviewed(student.id)}
                            className="flex items-center gap-2 px-3 py-1.5 bg-green-600 text-white text-sm rounded-md hover:bg-green-700"
                          >
                            <CheckCircle className="w-4 h-4" />
                            Marcar como revisado
                          </button>
                        )}
                      </div>

                      {/* Mostrar puntajes de ortografía/redacción si existen */}
                      {(student.spellingScore !== null || student.writingScore !== null || student.pasteAttempts !== undefined && student.pasteAttempts > 0) && (
                        <div className="mb-4 p-4 bg-white rounded-lg border border-gray-200">
                          <h4 className="font-medium text-gray-900 mb-3">Evaluación Adicional</h4>
                          <div className="grid grid-cols-3 gap-4 text-sm">
                            {student.spellingScore !== null && student.spellingScore !== undefined && (
                              <div>
                                <p className="text-gray-500">Ortografía:</p>
                                <p className="font-bold text-gray-900">{student.spellingScore.toFixed(1)} pts</p>
                              </div>
                            )}
                            {student.writingScore !== null && student.writingScore !== undefined && (
                              <div>
                                <p className="text-gray-500">Redacción:</p>
                                <p className="font-bold text-gray-900">{student.writingScore.toFixed(1)} pts</p>
                              </div>
                            )}
                            {student.pasteAttempts !== undefined && student.pasteAttempts > 0 && (
                              <div>
                                <p className="text-gray-500">Intentos de pegar texto externo:</p>
                                <p className="font-bold text-amber-600">{student.pasteAttempts}</p>
                              </div>
                            )}
                          </div>
                          {student.spellingWritingFeedback && (
                            <div className="mt-3 pt-3 border-t border-gray-100">
                              <p className="text-gray-500 text-sm mb-1">Feedback de ortografía/redacción:</p>
                              <p className="text-gray-700 text-sm italic">{student.spellingWritingFeedback}</p>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="space-y-3">
                        {student.answers.map((answer) => (
                          <div
                            key={answer.id}
                            className="bg-white rounded-lg border border-gray-200 p-4"
                          >
                            <div className="flex items-start justify-between mb-2">
                              <div>
                                <span className="text-sm font-medium text-gray-900">
                                  Pregunta {answer.questionNumber}
                                </span>
                                <span className="ml-2 text-xs text-gray-500">
                                  ({formatQuestionType(answer.questionType)})
                                </span>
                              </div>

                              {editingAnswer === answer.id ? (
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => setEditingAnswer(null)}
                                    className="p-1 text-gray-400 hover:text-gray-600"
                                    disabled={isSaving}
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => saveAnswerEdit(answer.id)}
                                    className="p-1 text-green-600 hover:text-green-700"
                                    disabled={isSaving}
                                  >
                                    <Save className="w-4 h-4" />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => startEditAnswer(answer)}
                                  className="p-1 text-gray-400 hover:text-gray-600"
                                >
                                  <Edit className="w-4 h-4" />
                                </button>
                              )}
                            </div>

                            <div className="text-sm text-gray-600 mb-3 line-clamp-2">
                              <RichMathText text={answer.questionText} />
                            </div>

                            <div className="grid grid-cols-2 gap-4 text-sm">
                              <div>
                                <p className="text-gray-500 mb-1">Respuesta del estudiante:</p>
                                <p className="text-gray-900 bg-gray-50 p-2 rounded">
                                  {answer.answerValue ? (
                                    answer.questionType === 'MATH' ? (
                                      <MathDisplay latex={answer.answerValue} />
                                    ) : (
                                      answer.answerValue
                                    )
                                  ) : (
                                    <em className="text-gray-400">Sin respuesta</em>
                                  )}
                                </p>
                                {/* Mostrar justificación para V/F si existe */}
                                {answer.questionType === 'TRUE_FALSE' && answer.justification && (
                                  <div className="mt-2">
                                    <p className="text-gray-500 mb-1">Justificación (V/F Falso):</p>
                                    <p className="text-gray-900 bg-blue-50 p-2 rounded text-sm">
                                      {answer.justification}
                                    </p>
                                  </div>
                                )}
                              </div>
                              <div>
                                <p className="text-gray-500 mb-1">Respuesta correcta:</p>
                                {answer.correctAnswer ? (
                                  <p className="text-gray-900 bg-gray-50 p-2 rounded">
                                    <RichMathText text={answer.correctAnswer} />
                                  </p>
                                ) : answer.correctionCriteria ? (
                                  <button
                                    onClick={() => setShowCriteriaModal({
                                      questionNumber: answer.questionNumber,
                                      criteria: answer.correctionCriteria!,
                                    })}
                                    className="flex items-center gap-2 text-primary hover:text-primary-dark bg-primary/10 hover:bg-primary/20 p-2 rounded transition-colors w-full text-left"
                                  >
                                    <FileText className="w-4 h-4 flex-shrink-0" />
                                    <span className="text-sm font-medium">Ver pauta de corrección</span>
                                  </button>
                                ) : (
                                  <p className="text-gray-400 bg-gray-50 p-2 rounded italic">
                                    Sin pauta definida
                                  </p>
                                )}
                              </div>
                            </div>

                            <div className="mt-3 pt-3 border-t border-gray-100">
                              {editingAnswer === answer.id ? (
                                <div className="space-y-3">
                                  <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                      Puntaje (máx: {answer.maxPoints})
                                    </label>
                                    <input
                                      type="number"
                                      min="0"
                                      max={answer.maxPoints}
                                      step="1"
                                      value={editValues.points}
                                      onChange={(e) => setEditValues({ ...editValues, points: Math.round(parseFloat(e.target.value) || 0) })}
                                      className="w-24 px-2 py-1 border border-gray-300 rounded text-gray-900"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                      Feedback
                                    </label>
                                    <textarea
                                      value={editValues.feedback}
                                      onChange={(e) => setEditValues({ ...editValues, feedback: e.target.value })}
                                      rows={2}
                                      className="w-full px-2 py-1 border border-gray-300 rounded text-gray-900"
                                    />
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-start justify-between">
                                  <div>
                                    <span className="text-sm text-gray-500">Puntaje:</span>
                                    <span className={`ml-2 font-bold ${
                                      answer.pointsEarned === answer.maxPoints
                                        ? 'text-green-600'
                                        : answer.pointsEarned === 0
                                        ? 'text-red-600'
                                        : 'text-yellow-600'
                                    }`}>
                                      {answer.pointsEarned ?? '-'}/{answer.maxPoints}
                                    </span>
                                  </div>
                                  {answer.aiFeedback && (
                                    <p className="text-sm text-gray-600 italic ml-4 flex-1">
                                      {answer.aiFeedback}
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {data.students.length === 0 && (
              <div className="px-4 py-12 text-center text-gray-500">
                No hay estudiantes que hayan entregado esta prueba
              </div>
            )}
          </div>
        </div>

        {/* Modal de confirmación de envío de emails */}
        {showSendConfirm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-blue-100 rounded-full">
                  <Mail className="w-6 h-6 text-blue-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Enviar resultados por email
                </h3>
              </div>

              <p className="text-gray-600 mb-4">
                {selectedStudents.size > 0
                  ? `¿Enviar resultados a ${selectedStudents.size} estudiante(s) seleccionado(s)?`
                  : `¿Enviar resultados a todos los ${data.students.filter(s => s.studentEmail).length} estudiante(s) con email?`
                }
              </p>

              <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 mb-4">
                <p className="text-sm text-yellow-800">
                  Solo se enviará a estudiantes que tengan email registrado.
                </p>
              </div>

              <label className="flex items-center gap-3 mb-4 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeGradeInEmail}
                  onChange={(e) => setIncludeGradeInEmail(e.target.checked)}
                  className="rounded border-gray-300 text-primary focus:ring-primary w-5 h-5"
                />
                <div>
                  <p className="text-sm font-medium text-gray-900">Incluir nota en resultados</p>
                  <p className="text-xs text-gray-500">Exigencia actual: {passingThreshold}%</p>
                </div>
              </label>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowSendConfirm(false)}
                  disabled={isSendingEmails}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={sendResultsEmails}
                  disabled={isSendingEmails}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {isSendingEmails ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    <>
                      <Mail className="w-4 h-4" />
                      Enviar
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal de pauta de corrección */}
        {showCriteriaModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col">
              <div className="flex items-center justify-between p-4 border-b border-gray-200">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-full">
                    <FileText className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    Pauta de Corrección - Pregunta {showCriteriaModal.questionNumber}
                  </h3>
                </div>
                <button
                  onClick={() => setShowCriteriaModal(null)}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              <div className="p-4 overflow-y-auto flex-1">
                <div className="prose prose-sm max-w-none">
                  <div className="whitespace-pre-wrap text-gray-700 bg-gray-50 p-4 rounded-lg text-sm font-normal">
                    <RichMathText text={showCriteriaModal.criteria} />
                  </div>
                </div>
              </div>
              <div className="p-4 border-t border-gray-200">
                <button
                  onClick={() => setShowCriteriaModal(null)}
                  className="w-full px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors font-medium"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
