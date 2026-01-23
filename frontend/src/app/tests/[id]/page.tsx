'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import ProtectedRoute from '@/components/ProtectedRoute';
import Navbar from '@/components/Navbar';
import QuestionEditor from '@/components/QuestionEditor';
import { testsAPI, questionsAPI, coursesAPI } from '@/lib/api';
import { Test, Question, Course } from '@/types';
import { ArrowLeft, Save, Play, CheckCircle, Users, AlertCircle } from 'lucide-react';
import { ROUTES } from '@/config/constants';

export default function TestDetailPage() {
  const router = useRouter();
  const params = useParams();
  const testId = params.id as string;

  const [test, setTest] = useState<Test | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [editedQuestions, setEditedQuestions] = useState<Map<string, Partial<Question>>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isActivating, setIsActivating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Course assignment
  const [courses, setCourses] = useState<Course[]>([]);
  const [isLoadingCourses, setIsLoadingCourses] = useState(false);
  const [showCourseSelector, setShowCourseSelector] = useState(false);
  const [selectedCourseId, setSelectedCourseId] = useState<string>('');
  const [isAssigningCourse, setIsAssigningCourse] = useState(false);

  // Cargar prueba y preguntas
  useEffect(() => {
    loadTest();
  }, [testId]);

  const loadTest = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const data = await testsAPI.getById(testId);
      setTest(data);

      // Ordenar preguntas por número
      const sortedQuestions = (data.questions || []).sort((a, b) => {
        const numA = a.questionNumber || a.question_number || 0;
        const numB = b.questionNumber || b.question_number || 0;
        return numA - numB;
      });

      setQuestions(sortedQuestions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar la prueba');
    } finally {
      setIsLoading(false);
    }
  };

  // Cargar cursos cuando se necesite
  const loadCourses = async () => {
    try {
      setIsLoadingCourses(true);
      const data = await coursesAPI.list();
      setCourses(data);
    } catch (err) {
      console.error('Error al cargar cursos:', err);
    } finally {
      setIsLoadingCourses(false);
    }
  };

  // Manejar cambios en una pregunta
  const handleQuestionChange = (questionId: string, updates: Partial<Question>) => {
    setEditedQuestions(prev => {
      const newMap = new Map(prev);
      const existing = newMap.get(questionId) || {};
      newMap.set(questionId, { ...existing, ...updates });
      return newMap;
    });
  };

  // Guardar todos los cambios
  const handleSaveChanges = async () => {
    if (editedQuestions.size === 0) {
      setError('No hay cambios para guardar');
      return;
    }

    try {
      setIsSaving(true);
      setError(null);
      setSuccessMessage(null);

      // Actualizar cada pregunta modificada
      const updatePromises = Array.from(editedQuestions.entries()).map(([questionId, updates]) =>
        questionsAPI.update(testId, questionId, updates)
      );

      await Promise.all(updatePromises);

      // Limpiar ediciones y recargar
      setEditedQuestions(new Map());
      await loadTest();

      setSuccessMessage(`${editedQuestions.size} pregunta(s) actualizada(s) correctamente`);

      // Limpiar mensaje después de 3 segundos
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar los cambios');
    } finally {
      setIsSaving(false);
    }
  };

  // Asignar curso a la prueba
  const handleAssignCourse = async () => {
    if (!selectedCourseId) return;

    try {
      setIsAssigningCourse(true);
      setError(null);

      await testsAPI.update(testId, { courseId: selectedCourseId });
      await loadTest();

      setShowCourseSelector(false);
      setSelectedCourseId('');
      setSuccessMessage('Curso asignado correctamente');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al asignar el curso');
    } finally {
      setIsAssigningCourse(false);
    }
  };

  // Abrir selector de curso
  const openCourseSelector = () => {
    setShowCourseSelector(true);
    if (courses.length === 0) {
      loadCourses();
    }
  };

  // Activar prueba
  const handleActivateTest = async () => {
    if (!test) return;

    // Verificar si ya está activada (revisar varios formatos)
    const isActive = test.isActive ?? test.is_active;
    const status = (test as any).status;
    const alreadyActive = isActive || status === 'ACTIVE';

    if (alreadyActive) {
      // Ya está activa, ir directo a la página de activación
      router.push(ROUTES.TEST_ACTIVATE(testId));
      return;
    }

    // Verificar que tenga curso asignado
    const courseId = test.courseId || test.course_id;
    if (!courseId) {
      setError('Debes asignar un curso antes de activar la prueba');
      return;
    }

    // Verificar que todas las preguntas tengan respuesta correcta configurada
    const hasUnconfiguredQuestions = questions.some(q => {
      const questionType = q.questionType || q.type;
      const correctAnswer = q.correctAnswer || q.correct_answer;
      const correctionCriteria = q.correctionCriteria || q.correction_criteria;

      if (questionType === 'DEVELOPMENT') {
        return !correctionCriteria;
      }
      return !correctAnswer;
    });

    if (hasUnconfiguredQuestions) {
      setError('Debes configurar las respuestas correctas de todas las preguntas antes de activar');
      return;
    }

    try {
      setIsActivating(true);
      setError(null);

      const response = await testsAPI.activate(testId);

      // Actualizar el estado local con la prueba activada
      setTest(response.test || response);

      // Redirigir a página de activación
      router.push(ROUTES.TEST_ACTIVATE(testId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al activar la prueba');
    } finally {
      setIsActivating(false);
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
        <div className="min-h-screen bg-gray-50">
          <Navbar />
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-gray-600">Cargando prueba...</p>
            </div>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  if (!test) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gray-50">
          <Navbar />
          <div className="max-w-3xl mx-auto px-6 py-8">
            <div className="bg-red-50 border border-red-200 rounded-md p-4">
              <p className="text-red-600">Prueba no encontrada</p>
            </div>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  const isActive = (test.isActive ?? test.is_active) || (test as any).status === 'ACTIVE';
  const courseId = test.courseId || test.course_id;

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        <Navbar />

        <div className="max-w-4xl mx-auto px-6 py-8">
          {/* Back Button */}
          <button
            onClick={handleBack}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver al Dashboard
          </button>

          {/* Header */}
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              {test.title}
            </h1>
            <div className="flex items-center gap-4 text-sm text-gray-600">
              <span>{questions.length} preguntas</span>
              <span>•</span>
              {isActive ? (
                <span className="inline-flex items-center gap-1 text-green-600">
                  <CheckCircle className="w-4 h-4" />
                  Activa
                </span>
              ) : (
                <span className="text-gray-500">Borrador</span>
              )}
            </div>
          </div>

          {/* Course Info */}
          <div className="mb-6">
            {test.course ? (
              <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                <div className="flex items-center justify-between">
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
              </div>
            ) : !isActive ? (
              <div className="bg-amber-50 border border-amber-200 rounded-md p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-amber-800 font-medium">
                      Sin curso asignado
                    </p>
                    <p className="text-sm text-amber-700 mt-1">
                      Debes asignar un curso antes de poder activar la prueba.
                    </p>
                    {!showCourseSelector && (
                      <button
                        onClick={openCourseSelector}
                        className="mt-2 text-sm font-medium text-amber-800 hover:text-amber-900 underline"
                      >
                        Asignar curso ahora
                      </button>
                    )}
                  </div>
                </div>

                {/* Course selector */}
                {showCourseSelector && (
                  <div className="mt-4 pt-4 border-t border-amber-200">
                    {isLoadingCourses ? (
                      <p className="text-amber-700">Cargando cursos...</p>
                    ) : courses.length === 0 ? (
                      <div>
                        <p className="text-amber-700 mb-2">No tienes cursos creados.</p>
                        <button
                          onClick={() => router.push(ROUTES.NEW_COURSE)}
                          className="text-sm font-medium text-amber-800 hover:text-amber-900 underline"
                        >
                          Crear un curso
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <select
                          value={selectedCourseId}
                          onChange={(e) => setSelectedCourseId(e.target.value)}
                          className="flex-1 px-3 py-2 border border-amber-300 rounded-md bg-white text-gray-900 focus:ring-2 focus:ring-amber-500"
                        >
                          <option value="">Selecciona un curso</option>
                          {courses.map((course) => (
                            <option key={course.id} value={course.id}>
                              {course.name} ({course.year}) - {course._count?.students || 0} estudiantes
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={handleAssignCourse}
                          disabled={!selectedCourseId || isAssigningCourse}
                          className="px-4 py-2 bg-amber-600 text-white rounded-md hover:bg-amber-700 disabled:opacity-50"
                        >
                          {isAssigningCourse ? 'Asignando...' : 'Asignar'}
                        </button>
                        <button
                          onClick={() => setShowCourseSelector(false)}
                          className="px-4 py-2 border border-amber-300 rounded-md hover:bg-amber-100"
                        >
                          Cancelar
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : null}
          </div>

          {/* Success Message */}
          {successMessage && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-md">
              <p className="text-sm text-green-600">{successMessage}</p>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* Questions List */}
          <div className="space-y-6 mb-8">
            {questions.map((question, index) => (
              <QuestionEditor
                key={question.id}
                question={question}
                index={index}
                onChange={(updates) => handleQuestionChange(question.id, updates)}
              />
            ))}
          </div>

          {/* Action Buttons */}
          <div className="sticky bottom-6 bg-white rounded-lg shadow-lg p-6 border border-gray-200">
            <div className="flex gap-4">
              <button
                onClick={handleSaveChanges}
                disabled={isSaving || editedQuestions.size === 0}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-primary text-white rounded-md hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save className="w-5 h-5" />
                {isSaving ? 'Guardando...' : `Guardar Cambios${editedQuestions.size > 0 ? ` (${editedQuestions.size})` : ''}`}
              </button>

              {!isActive ? (
                <button
                  onClick={handleActivateTest}
                  disabled={isActivating}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Play className="w-5 h-5" />
                  {isActivating ? 'Activando...' : 'Activar Prueba'}
                </button>
              ) : (
                <button
                  onClick={handleActivateTest}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                >
                  <CheckCircle className="w-5 h-5" />
                  Ver Código/QR
                </button>
              )}
            </div>

            {editedQuestions.size > 0 && (
              <p className="text-xs text-gray-500 mt-2 text-center">
                Tienes {editedQuestions.size} pregunta(s) con cambios sin guardar
              </p>
            )}
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
