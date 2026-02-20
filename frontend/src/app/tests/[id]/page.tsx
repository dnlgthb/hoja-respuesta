'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import ProtectedRoute from '@/components/ProtectedRoute';
import Navbar from '@/components/Navbar';
import QuestionEditor from '@/components/QuestionEditor';
import { testsAPI, questionsAPI, coursesAPI } from '@/lib/api';
import { Test, Question, Course, RubricSuggestion } from '@/types';
import { ArrowLeft, Save, Play, CheckCircle, Users, AlertCircle, Clock, X, Settings, Plus, FileUp, Sparkles, AlertTriangle, Check } from 'lucide-react';
import { QuestionType } from '@/types';
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

  // Duration modal
  const [showDurationModal, setShowDurationModal] = useState(false);
  const [durationMinutes, setDurationMinutes] = useState<string>('60');

  // Correction options
  const [requireFalseJustification, setRequireFalseJustification] = useState(false);
  const [falseJustificationPenalty, setFalseJustificationPenalty] = useState<string>('50');
  const [evaluateSpelling, setEvaluateSpelling] = useState(false);
  const [evaluateWriting, setEvaluateWriting] = useState(false);
  const [spellingPoints, setSpellingPoints] = useState<string>('');
  const [writingPoints, setWritingPoints] = useState<string>('');
  const [hasUnsavedCorrectionOptions, setHasUnsavedCorrectionOptions] = useState(false);

  // Rubric (pauta de corrección)
  const [showRubricUploadModal, setShowRubricUploadModal] = useState(false);
  const [showRubricPreviewModal, setShowRubricPreviewModal] = useState(false);
  const [rubricFile, setRubricFile] = useState<File | null>(null);
  const [isAnalyzingRubric, setIsAnalyzingRubric] = useState(false);
  const [rubricSuggestions, setRubricSuggestions] = useState<RubricSuggestion[]>([]);
  const [editedSuggestions, setEditedSuggestions] = useState<RubricSuggestion[]>([]);
  const [isApplyingRubric, setIsApplyingRubric] = useState(false);

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

      // Cargar opciones de corrección
      setRequireFalseJustification(data.requireFalseJustification ?? data.require_false_justification ?? false);
      setFalseJustificationPenalty(String((data.falseJustificationPenalty ?? data.false_justification_penalty ?? 0.5) * 100));
      setEvaluateSpelling(data.evaluateSpelling ?? data.evaluate_spelling ?? false);
      setEvaluateWriting(data.evaluateWriting ?? data.evaluate_writing ?? false);
      setSpellingPoints(data.spellingPoints ?? data.spelling_points ? String(data.spellingPoints ?? data.spelling_points) : '');
      setWritingPoints(data.writingPoints ?? data.writing_points ? String(data.writingPoints ?? data.writing_points) : '');
      setHasUnsavedCorrectionOptions(false);
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

  // Eliminar una pregunta
  const handleDeleteQuestion = async (questionId: string) => {
    if (!confirm('¿Estás seguro de que deseas eliminar esta pregunta?')) {
      return;
    }

    try {
      setError(null);
      await questionsAPI.delete(testId, questionId);
      setQuestions(prev => prev.filter(q => q.id !== questionId));
      setEditedQuestions(prev => {
        const newMap = new Map(prev);
        newMap.delete(questionId);
        return newMap;
      });
      setSuccessMessage('Pregunta eliminada correctamente');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar la pregunta');
    }
  };

  // Agregar nueva pregunta
  const handleAddQuestion = async () => {
    try {
      setError(null);
      const newQuestion = await questionsAPI.create(testId, {
        question_text: 'Nueva pregunta',
        type: QuestionType.DEVELOPMENT,
        points: 1,
      });
      setQuestions(prev => [...prev, newQuestion]);
      setSuccessMessage('Pregunta agregada correctamente');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al agregar la pregunta');
    }
  };

  // Mover pregunta arriba
  const handleMoveUp = async (index: number) => {
    if (index <= 0) return;

    const newQuestions = [...questions];
    [newQuestions[index - 1], newQuestions[index]] = [newQuestions[index], newQuestions[index - 1]];

    // Actualizar UI inmediatamente
    setQuestions(newQuestions);

    // Guardar nuevo orden en backend
    try {
      await questionsAPI.reorder(testId, newQuestions.map(q => q.id));
    } catch (err) {
      // Revertir si falla
      setQuestions(questions);
      setError(err instanceof Error ? err.message : 'Error al reordenar');
    }
  };

  // Mover pregunta abajo
  const handleMoveDown = async (index: number) => {
    if (index >= questions.length - 1) return;

    const newQuestions = [...questions];
    [newQuestions[index], newQuestions[index + 1]] = [newQuestions[index + 1], newQuestions[index]];

    // Actualizar UI inmediatamente
    setQuestions(newQuestions);

    // Guardar nuevo orden en backend
    try {
      await questionsAPI.reorder(testId, newQuestions.map(q => q.id));
    } catch (err) {
      // Revertir si falla
      setQuestions(questions);
      setError(err instanceof Error ? err.message : 'Error al reordenar');
    }
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

  // Guardar opciones de corrección
  const handleSaveCorrectionOptions = async () => {
    try {
      setIsSaving(true);
      setError(null);

      await testsAPI.update(testId, {
        requireFalseJustification,
        falseJustificationPenalty: parseFloat(falseJustificationPenalty) / 100,
        evaluateSpelling,
        evaluateWriting,
        spellingPoints: evaluateSpelling && spellingPoints ? parseFloat(spellingPoints) : null,
        writingPoints: evaluateWriting && writingPoints ? parseFloat(writingPoints) : null,
      });

      setHasUnsavedCorrectionOptions(false);
      setSuccessMessage('Opciones de corrección guardadas correctamente');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar opciones de corrección');
    } finally {
      setIsSaving(false);
    }
  };

  // Handler para cambios en opciones de corrección
  const handleCorrectionOptionChange = () => {
    setHasUnsavedCorrectionOptions(true);
  };

  // Abrir modal de activación
  const handleOpenActivateModal = () => {
    if (!test) return;

    // Verificar si ya está activada (revisar varios formatos)
    const isActiveCheck = test.isActive ?? test.is_active;
    const status = (test as any).status;
    const alreadyActive = isActiveCheck || status === 'ACTIVE';

    if (alreadyActive) {
      // Ya está activa, ir directo a la página de activación
      router.push(ROUTES.TEST_ACTIVATE(testId));
      return;
    }

    // Verificar que tenga curso asignado
    const courseIdCheck = test.courseId || test.course_id;
    if (!courseIdCheck) {
      setError('Debes asignar un curso antes de activar la prueba');
      return;
    }

    // Verificar que todas las preguntas tengan respuesta correcta configurada
    const hasUnconfiguredQuestions = questions.some(q => {
      const questionType = q.questionType || q.type;
      const correctAnswer = q.correctAnswer || q.correct_answer;
      const correctionCriteria = q.correctionCriteria || q.correction_criteria;

      // DEVELOPMENT y MATH pueden usar correctionCriteria en vez de correctAnswer
      if (questionType === 'DEVELOPMENT' || questionType === 'MATH') {
        return !correctionCriteria && !correctAnswer;
      }
      return !correctAnswer;
    });

    if (hasUnconfiguredQuestions) {
      setError('Debes configurar las respuestas correctas de todas las preguntas antes de activar');
      return;
    }

    setError(null);
    setShowDurationModal(true);
  };

  // Activar prueba con duración
  const handleActivateTest = async () => {
    if (!test) return;

    const duration = parseInt(durationMinutes);
    if (isNaN(duration) || duration < 1 || duration > 480) {
      setError('La duración debe ser entre 1 y 480 minutos');
      return;
    }

    try {
      setIsActivating(true);
      setError(null);

      const response = await testsAPI.activate(testId, duration);

      // Actualizar el estado local con la prueba activada
      setTest(response.test || response);

      setShowDurationModal(false);

      // Redirigir a página de activación
      router.push(ROUTES.TEST_ACTIVATE(testId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al activar la prueba');
    } finally {
      setIsActivating(false);
    }
  };

  // Analizar pauta de corrección
  const handleAnalyzeRubric = async () => {
    if (!rubricFile) return;

    try {
      setIsAnalyzingRubric(true);
      setError(null);

      const result = await testsAPI.analyzeRubric(testId, rubricFile);

      setRubricSuggestions(result.suggestions);
      setEditedSuggestions(JSON.parse(JSON.stringify(result.suggestions)));
      setShowRubricUploadModal(false);
      setShowRubricPreviewModal(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al analizar la pauta');
    } finally {
      setIsAnalyzingRubric(false);
    }
  };

  // Aplicar sugerencias de la pauta
  const handleApplyRubric = async () => {
    try {
      setIsApplyingRubric(true);
      setError(null);

      const updates = editedSuggestions
        .filter(s => s.correct_answer !== null || s.correction_criteria !== null)
        .map(s => ({
          questionId: s.question_id,
          data: {
            ...(s.correct_answer !== null && { correct_answer: s.correct_answer }),
            ...(s.correction_criteria !== null && { correction_criteria: s.correction_criteria }),
            ...(s.points !== null && { points: s.points }),
            ...(s.options.require_units && { require_units: true, unit_penalty: s.options.unit_penalty }),
          },
        }));

      if (updates.length === 0) {
        setError('No hay sugerencias para aplicar');
        setIsApplyingRubric(false);
        return;
      }

      await questionsAPI.batchUpdate(testId, updates);
      await loadTest();

      setShowRubricPreviewModal(false);
      setRubricSuggestions([]);
      setEditedSuggestions([]);
      setRubricFile(null);
      setSuccessMessage(`Pauta aplicada: ${updates.length} pregunta(s) actualizada(s)`);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al aplicar la pauta');
    } finally {
      setIsApplyingRubric(false);
    }
  };

  // Editar una sugerencia individual
  const handleEditSuggestion = (index: number, field: string, value: any) => {
    setEditedSuggestions(prev => {
      const updated = [...prev];
      if (field === 'correct_answer' || field === 'correction_criteria') {
        (updated[index] as any)[field] = value;
      } else if (field === 'points') {
        updated[index].points = value;
      }
      return updated;
    });
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
        <div className="min-h-screen bg-[#FBF9F3]">
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
      <div className="min-h-screen bg-[#FBF9F3]">
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
            <div className="flex items-start justify-between">
              <div>
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
              {questions.length > 0 && (
                <button
                  onClick={() => {
                    setRubricFile(null);
                    setShowRubricUploadModal(true);
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors text-sm"
                >
                  <FileUp className="w-4 h-4" />
                  Cargar pauta
                </button>
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
                          className="px-4 py-2 border border-amber-300 rounded-md hover:bg-amber-100 text-gray-700 font-medium"
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

          {/* Correction Options Section */}
          {!isActive && (
            <div className="mb-6 bg-white rounded-lg shadow-md border border-gray-200 p-6">
              <div className="flex items-center gap-2 mb-4">
                <Settings className="w-5 h-5 text-gray-600" />
                <h2 className="text-lg font-semibold text-gray-900">Opciones de Corrección</h2>
              </div>

              <div className="space-y-4">
                {/* Justificación V/F */}
                <div className="border-b border-gray-100 pb-4">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={requireFalseJustification}
                      onChange={(e) => {
                        setRequireFalseJustification(e.target.checked);
                        handleCorrectionOptionChange();
                      }}
                      className="mt-1 w-4 h-4 text-primary rounded focus:ring-primary"
                    />
                    <div>
                      <span className="font-medium text-gray-900">Requerir justificación en respuestas Falsas (V/F)</span>
                      <p className="text-sm text-gray-500">Los estudiantes deberán explicar por qué una afirmación es falsa</p>
                    </div>
                  </label>
                  {requireFalseJustification && (
                    <div className="ml-7 mt-3 flex items-center gap-2">
                      <label className="text-sm text-gray-700">Descuento si no justifica o justifica mal:</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={falseJustificationPenalty}
                        onChange={(e) => {
                          setFalseJustificationPenalty(e.target.value);
                          handleCorrectionOptionChange();
                        }}
                        className="w-20 px-2 py-1 border border-gray-300 rounded text-sm text-gray-900 focus:ring-2 focus:ring-primary"
                      />
                      <span className="text-sm text-gray-700">%</span>
                    </div>
                  )}
                </div>

                {/* Ortografía y Redacción */}
                <div className="space-y-3">
                  <p className="text-sm text-gray-500">
                    Evalúa la ortografía y redacción en todas las preguntas de desarrollo de forma global.
                  </p>

                  {/* Ortografía */}
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={evaluateSpelling}
                        onChange={(e) => {
                          setEvaluateSpelling(e.target.checked);
                          handleCorrectionOptionChange();
                        }}
                        className="w-4 h-4 text-primary rounded focus:ring-primary"
                      />
                      <span className="text-gray-900">Evaluar ortografía</span>
                    </label>
                    {evaluateSpelling && (
                      <div className="flex items-center gap-2">
                        <label className="text-sm text-gray-700">Puntaje:</label>
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          value={spellingPoints}
                          onChange={(e) => {
                            setSpellingPoints(e.target.value);
                            handleCorrectionOptionChange();
                          }}
                          placeholder="0"
                          className="w-20 px-2 py-1 border border-gray-300 rounded text-sm text-gray-900 focus:ring-2 focus:ring-primary"
                        />
                        <span className="text-sm text-gray-700">pts</span>
                      </div>
                    )}
                  </div>

                  {/* Redacción */}
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={evaluateWriting}
                        onChange={(e) => {
                          setEvaluateWriting(e.target.checked);
                          handleCorrectionOptionChange();
                        }}
                        className="w-4 h-4 text-primary rounded focus:ring-primary"
                      />
                      <span className="text-gray-900">Evaluar redacción</span>
                    </label>
                    {evaluateWriting && (
                      <div className="flex items-center gap-2">
                        <label className="text-sm text-gray-700">Puntaje:</label>
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          value={writingPoints}
                          onChange={(e) => {
                            setWritingPoints(e.target.value);
                            handleCorrectionOptionChange();
                          }}
                          placeholder="0"
                          className="w-20 px-2 py-1 border border-gray-300 rounded text-sm text-gray-900 focus:ring-2 focus:ring-primary"
                        />
                        <span className="text-sm text-gray-700">pts</span>
                      </div>
                    )}
                  </div>

                  {!questions.some(q => (q.questionType || q.type) === 'DEVELOPMENT') && (evaluateSpelling || evaluateWriting) && (
                    <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded">
                      ⚠️ No hay preguntas de desarrollo en esta prueba. La evaluación de ortografía/redacción solo aplica a preguntas de desarrollo.
                    </p>
                  )}
                </div>

                {/* Botón guardar opciones */}
                {hasUnsavedCorrectionOptions && (
                  <div className="pt-4 border-t border-gray-100">
                    <button
                      onClick={handleSaveCorrectionOptions}
                      disabled={isSaving}
                      className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark transition-colors disabled:opacity-50"
                    >
                      {isSaving ? 'Guardando...' : 'Guardar opciones de corrección'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

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
          <div className="space-y-4 mb-8">
            {questions.map((question, index) => (
              <QuestionEditor
                key={question.id}
                question={question}
                index={index}
                totalQuestions={questions.length}
                onChange={(updates) => handleQuestionChange(question.id, updates)}
                onDelete={() => handleDeleteQuestion(question.id)}
                onMoveUp={() => handleMoveUp(index)}
                onMoveDown={() => handleMoveDown(index)}
                requireFalseJustification={requireFalseJustification}
                isFirst={index === 0}
                isLast={index === questions.length - 1}
              />
            ))}

            {/* Botón agregar pregunta */}
            {!isActive && (
              <button
                type="button"
                onClick={handleAddQuestion}
                className="w-full py-4 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-primary hover:text-primary hover:bg-primary/5 transition-colors flex items-center justify-center gap-2"
              >
                <Plus className="w-5 h-5" />
                Agregar pregunta
              </button>
            )}
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
                  onClick={handleOpenActivateModal}
                  disabled={isActivating}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Play className="w-5 h-5" />
                  {isActivating ? 'Activando...' : 'Activar Prueba'}
                </button>
              ) : (
                <button
                  onClick={handleOpenActivateModal}
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

        {/* Modal de Duración */}
        {showDurationModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
              <div className="flex items-center justify-between p-4 border-b">
                <h3 className="text-lg font-semibold text-gray-900">
                  Configurar Tiempo de Prueba
                </h3>
                <button
                  onClick={() => setShowDurationModal(false)}
                  className="p-1 hover:bg-gray-100 rounded"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              <div className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Clock className="w-6 h-6 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">Duración de la prueba</p>
                    <p className="text-sm text-gray-500">
                      Define cuánto tiempo tendrán los estudiantes
                    </p>
                  </div>
                </div>

                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Tiempo en minutos
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="480"
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(e.target.value)}
                    onBlur={(e) => {
                      const val = parseInt(e.target.value);
                      if (isNaN(val) || val < 1) {
                        setDurationMinutes('1');
                      } else if (val > 480) {
                        setDurationMinutes('480');
                      }
                    }}
                    className="w-full px-4 py-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary focus:border-transparent text-lg text-gray-900"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Mínimo 1 minuto, máximo 480 minutos (8 horas)
                  </p>
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-md p-3 mb-6">
                  <p className="text-sm text-amber-800">
                    <strong>Importante:</strong> Una vez activada, los estudiantes tendrán exactamente{' '}
                    <strong>{durationMinutes || '0'} minutos</strong> para completar la prueba. Al terminar el tiempo,
                    las respuestas se enviarán automáticamente.
                  </p>
                </div>

                {error && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
                    <p className="text-sm text-red-600">{error}</p>
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => setShowDurationModal(false)}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 text-gray-700 font-medium"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleActivateTest}
                    disabled={isActivating}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                  >
                    <Play className="w-4 h-4" />
                    {isActivating ? 'Activando...' : 'Activar Prueba'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        {/* Modal: Cargar Pauta PDF */}
        {showRubricUploadModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
              <div className="flex items-center justify-between p-4 border-b">
                <h3 className="text-lg font-semibold text-gray-900">
                  Cargar Pauta de Corrección
                </h3>
                <button
                  onClick={() => setShowRubricUploadModal(false)}
                  disabled={isAnalyzingRubric}
                  className="p-1 hover:bg-gray-100 rounded"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              <div className="p-6">
                {!isAnalyzingRubric ? (
                  <>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2 bg-purple-100 rounded-lg">
                        <FileUp className="w-6 h-6 text-purple-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">Sube la pauta en PDF</p>
                        <p className="text-sm text-gray-500">
                          La IA analizará la pauta y sugerirá respuestas para cada pregunta
                        </p>
                      </div>
                    </div>

                    <div className="mb-4">
                      <label
                        className="block w-full border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-purple-400 hover:bg-purple-50 transition-colors"
                      >
                        <input
                          type="file"
                          accept=".pdf"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              if (file.size > 10 * 1024 * 1024) {
                                setError('El archivo no puede superar los 10MB');
                                return;
                              }
                              setRubricFile(file);
                            }
                          }}
                        />
                        {rubricFile ? (
                          <div className="flex items-center justify-center gap-2 text-purple-700">
                            <Check className="w-5 h-5" />
                            <span className="font-medium">{rubricFile.name}</span>
                            <span className="text-sm text-gray-500">
                              ({(rubricFile.size / 1024 / 1024).toFixed(1)} MB)
                            </span>
                          </div>
                        ) : (
                          <div>
                            <FileUp className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                            <p className="text-gray-600">Haz clic para seleccionar un PDF</p>
                            <p className="text-xs text-gray-400 mt-1">Máximo 10MB</p>
                          </div>
                        )}
                      </label>
                    </div>

                    <div className="flex gap-3">
                      <button
                        onClick={() => setShowRubricUploadModal(false)}
                        className="flex-1 px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 text-gray-700 font-medium"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={handleAnalyzeRubric}
                        disabled={!rubricFile}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50"
                      >
                        <Sparkles className="w-4 h-4" />
                        Analizar pauta
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="py-8 text-center">
                    <div className="w-12 h-12 mx-auto mb-4 relative">
                      <Sparkles className="w-12 h-12 text-purple-500 animate-pulse" />
                    </div>
                    <p className="text-lg font-medium text-gray-900 mb-1">Analizando pauta...</p>
                    <p className="text-sm text-gray-500">La IA está mapeando las respuestas a cada pregunta</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Modal: Preview de Sugerencias de Pauta */}
        {showRubricPreviewModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full mx-4 max-h-[85vh] flex flex-col">
              <div className="flex items-center justify-between p-4 border-b flex-shrink-0">
                <h3 className="text-lg font-semibold text-gray-900">
                  Sugerencias de la Pauta
                </h3>
                <button
                  onClick={() => setShowRubricPreviewModal(false)}
                  disabled={isApplyingRubric}
                  className="p-1 hover:bg-gray-100 rounded"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              <div className="p-4 overflow-y-auto flex-1">
                <p className="text-sm text-gray-600 mb-4">
                  Revisa y edita las sugerencias antes de aplicarlas. Las preguntas sin respuesta en la pauta aparecen marcadas.
                </p>

                <div className="space-y-4">
                  {editedSuggestions.map((suggestion, index) => {
                    const question = questions.find(q => q.id === suggestion.question_id);
                    if (!question) return null;

                    const questionType = question.questionType || question.type;
                    const currentAnswer = question.correctAnswer || question.correct_answer;
                    const currentCriteria = question.correctionCriteria || question.correction_criteria;
                    const hasExisting = !!currentAnswer || !!currentCriteria;
                    const noSuggestion = suggestion.correct_answer === null && suggestion.correction_criteria === null;

                    return (
                      <div
                        key={suggestion.question_id}
                        className={`border rounded-lg p-4 ${noSuggestion ? 'border-amber-300 bg-amber-50' : hasExisting ? 'border-blue-300 bg-blue-50' : 'border-gray-200'}`}
                      >
                        {/* Header de pregunta */}
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-sm font-bold text-gray-700">
                            {question.questionLabel || question.question_label || suggestion.question_number}
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded bg-gray-200 text-gray-600">
                            {questionType}
                          </span>
                          <span className="text-sm text-gray-500 truncate flex-1">
                            {(question.questionText || question.question_text || '').substring(0, 80)}
                            {(question.questionText || question.question_text || '').length > 80 ? '...' : ''}
                          </span>
                        </div>

                        {/* Advertencias */}
                        {noSuggestion && (
                          <div className="flex items-center gap-2 text-amber-700 text-sm mb-3">
                            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                            No se encontró respuesta en la pauta para esta pregunta
                          </div>
                        )}
                        {hasExisting && !noSuggestion && (
                          <div className="flex items-center gap-2 text-blue-700 text-sm mb-3">
                            <AlertCircle className="w-4 h-4 flex-shrink-0" />
                            Esta pregunta ya tiene respuesta configurada. Se sobrescribirá al aplicar.
                          </div>
                        )}

                        {/* Campos editables */}
                        {!noSuggestion && (
                          <div className="space-y-3">
                            {/* Respuesta correcta */}
                            {(questionType === 'TRUE_FALSE' || questionType === 'MULTIPLE_CHOICE') && (
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">
                                  Respuesta correcta
                                </label>
                                {questionType === 'TRUE_FALSE' ? (
                                  <div className="flex gap-4">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                      <input
                                        type="radio"
                                        name={`answer-${suggestion.question_id}`}
                                        value="V"
                                        checked={suggestion.correct_answer === 'V'}
                                        onChange={() => handleEditSuggestion(index, 'correct_answer', 'V')}
                                        className="text-purple-600"
                                      />
                                      <span className="text-sm text-gray-900">Verdadero</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                      <input
                                        type="radio"
                                        name={`answer-${suggestion.question_id}`}
                                        value="F"
                                        checked={suggestion.correct_answer === 'F'}
                                        onChange={() => handleEditSuggestion(index, 'correct_answer', 'F')}
                                        className="text-purple-600"
                                      />
                                      <span className="text-sm text-gray-900">Falso</span>
                                    </label>
                                  </div>
                                ) : (
                                  <input
                                    type="text"
                                    value={suggestion.correct_answer || ''}
                                    onChange={(e) => handleEditSuggestion(index, 'correct_answer', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm text-gray-900 focus:ring-2 focus:ring-purple-500"
                                    placeholder="Ej: A, B, C, D"
                                  />
                                )}
                              </div>
                            )}

                            {/* Para DEVELOPMENT y MATH: respuesta modelo + criterio */}
                            {(questionType === 'DEVELOPMENT' || questionType === 'MATH') && (
                              <>
                                <div>
                                  <label className="block text-xs font-medium text-gray-600 mb-1">
                                    Respuesta correcta
                                  </label>
                                  <textarea
                                    value={suggestion.correct_answer || ''}
                                    onChange={(e) => handleEditSuggestion(index, 'correct_answer', e.target.value)}
                                    rows={2}
                                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm text-gray-900 focus:ring-2 focus:ring-purple-500"
                                    placeholder="Respuesta modelo..."
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-gray-600 mb-1">
                                    Pauta de corrección
                                  </label>
                                  <textarea
                                    value={suggestion.correction_criteria || ''}
                                    onChange={(e) => handleEditSuggestion(index, 'correction_criteria', e.target.value)}
                                    rows={3}
                                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm text-gray-900 focus:ring-2 focus:ring-purple-500"
                                    placeholder="Criterios de evaluación..."
                                  />
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Footer con botones */}
              <div className="p-4 border-t flex-shrink-0">
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowRubricPreviewModal(false)}
                    disabled={isApplyingRubric}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 text-gray-700 font-medium"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleApplyRubric}
                    disabled={isApplyingRubric || editedSuggestions.every(s => s.correct_answer === null && s.correction_criteria === null)}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50"
                  >
                    <Check className="w-4 h-4" />
                    {isApplyingRubric ? 'Aplicando...' : 'Aplicar todo'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
