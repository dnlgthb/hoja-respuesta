'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { studentAPI } from '@/lib/api';
import {
  FileText, User, CheckCircle, Circle, ChevronDown, ChevronUp,
  Save, Loader2, AlertCircle, Send, X, Timer, Clock, Mail
} from 'lucide-react';
import MathField from '@/components/MathField';
import RichMathText from '@/components/RichMathText';

// ============================================
// CONSTANTES
// ============================================

const DEVICE_TOKEN_KEY = 'device_token';
const AUTOSAVE_INTERVAL = 10000; // 10 segundos

// ============================================
// TIPOS
// ============================================

interface Question {
  id: string;
  questionNumber: number;
  questionLabel?: string;
  type: 'TRUE_FALSE' | 'MULTIPLE_CHOICE' | 'DEVELOPMENT' | 'MATH';
  questionText: string;
  context?: string | null;
  points: number;
  options: string[] | null;
  imageUrl?: string | null;
  image_url?: string | null;
  hasImage?: boolean;
  has_image?: boolean;
  imageDescription?: string | null;
  image_description?: string | null;
}

interface AttemptData {
  id: string;
  studentName: string;
  studentEmail: string | null;
  status: 'IN_PROGRESS' | 'SUBMITTED';
  submittedAt: string | null;
  resultsToken?: string;
  answers: Array<{ questionId: string; answerValue: string; justification?: string | null }>;
  test: {
    id: string;
    title: string;
    pdfUrl: string | null;
    status: string;
    durationMinutes: number | null;
    endsAt: string | null;
    timeRemainingSeconds: number | null;
    requireFalseJustification?: boolean;
    questions: Question[];
  };
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

export default function PruebaAttemptPage() {
  const params = useParams();
  const router = useRouter();
  const attemptId = params.attemptId as string;

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attemptData, setAttemptData] = useState<AttemptData | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [justifications, setJustifications] = useState<Record<string, string>>({});
  const [showPdfMobile, setShowPdfMobile] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Timer state
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [showTimeUpModal, setShowTimeUpModal] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const hasAutoSubmittedRef = useRef(false);

  // Referencias para autosave
  const lastSavedAnswers = useRef<Record<string, string>>({});
  const deviceTokenRef = useRef<string | null>(null);

  // ============================================
  // CARGAR DATOS AL MONTAR
  // ============================================

  useEffect(() => {
    const loadAttempt = async () => {
      const deviceToken = localStorage.getItem(DEVICE_TOKEN_KEY);
      deviceTokenRef.current = deviceToken;

      if (!deviceToken) {
        router.push('/prueba');
        return;
      }

      try {
        const data = await studentAPI.getAttempt(attemptId, deviceToken);
        setAttemptData(data);

        // Inicializar respuestas y justificaciones existentes
        const existingAnswers: Record<string, string> = {};
        const existingJustifications: Record<string, string> = {};
        data.answers?.forEach((ans: { questionId: string; answerValue: string; justification?: string | null }) => {
          existingAnswers[ans.questionId] = ans.answerValue || '';
          if (ans.justification) {
            existingJustifications[ans.questionId] = ans.justification;
          }
        });
        setAnswers(existingAnswers);
        setJustifications(existingJustifications);
        lastSavedAnswers.current = { ...existingAnswers };
      } catch (err) {
        console.error('Error loading attempt:', err);
        setError('No se pudo cargar la prueba. Verifica tu acceso.');
        setTimeout(() => router.push('/prueba'), 2000);
      } finally {
        setIsLoading(false);
      }
    };

    loadAttempt();
  }, [attemptId, router]);

  // ============================================
  // INICIALIZAR TEMPORIZADOR
  // ============================================

  useEffect(() => {
    if (attemptData?.test.timeRemainingSeconds !== null && attemptData?.test.timeRemainingSeconds !== undefined) {
      setTimeRemaining(attemptData.test.timeRemainingSeconds);
    }
  }, [attemptData?.test.timeRemainingSeconds]);

  // Cuenta regresiva del temporizador
  useEffect(() => {
    if (timeRemaining === null || timeRemaining <= 0 || attemptData?.status === 'SUBMITTED') return;

    timerRef.current = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev === null || prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [timeRemaining !== null, attemptData?.status]);

  // Auto-submit cuando el tiempo termina
  useEffect(() => {
    if (timeRemaining === 0 && !hasAutoSubmittedRef.current && attemptData?.status === 'IN_PROGRESS') {
      hasAutoSubmittedRef.current = true;
      setShowTimeUpModal(true);
      handleAutoSubmit();
    }
  }, [timeRemaining, attemptData?.status]);

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

  // ============================================
  // FUNCIÓN DE GUARDADO
  // ============================================

  const saveAnswers = useCallback(async (force = false): Promise<boolean> => {
    if (!deviceTokenRef.current || !attemptData || attemptData.status === 'SUBMITTED') {
      return false;
    }

    // Verificar si hay cambios
    const hasChanges = JSON.stringify(answers) !== JSON.stringify(lastSavedAnswers.current);
    if (!hasChanges && !force) {
      return true;
    }

    // Convertir a formato de API (incluir justificaciones)
    const answersArray = Object.entries(answers)
      .filter(([_, value]) => value && value.trim() !== '')
      .map(([questionId, answerValue]) => ({
        questionId,
        answerValue,
        justification: justifications[questionId] || undefined,
      }));

    if (answersArray.length === 0 && !force) {
      return true;
    }

    try {
      setSaveStatus('saving');
      await studentAPI.saveAnswers(attemptId, deviceTokenRef.current, { answers: answersArray });
      lastSavedAnswers.current = { ...answers };
      setSaveStatus('saved');

      // Ocultar indicador después de 2 segundos
      setTimeout(() => setSaveStatus('idle'), 2000);
      return true;
    } catch (err) {
      console.error('Error saving answers:', err);
      setSaveStatus('error');
      return false;
    }
  }, [answers, justifications, attemptData, attemptId]);

  // ============================================
  // AUTOSAVE INTERVAL
  // ============================================

  useEffect(() => {
    if (!attemptData || attemptData.status === 'SUBMITTED') {
      return;
    }

    const interval = setInterval(() => {
      saveAnswers();
    }, AUTOSAVE_INTERVAL);

    return () => clearInterval(interval);
  }, [saveAnswers, attemptData]);

  // ============================================
  // GUARDAR AL CERRAR PESTAÑA
  // ============================================

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (attemptData?.status === 'SUBMITTED') return;

      const hasChanges = JSON.stringify(answers) !== JSON.stringify(lastSavedAnswers.current);
      if (hasChanges) {
        // Intentar guardar síncronamente (no siempre funciona)
        saveAnswers(true);
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [answers, attemptData, saveAnswers]);

  // ============================================
  // HANDLERS
  // ============================================

  const handleAnswerChange = (questionId: string, value: string) => {
    if (attemptData?.status === 'SUBMITTED') return;

    setAnswers((prev) => ({
      ...prev,
      [questionId]: value,
    }));
  };

  const handleJustificationChange = (questionId: string, value: string) => {
    if (attemptData?.status === 'SUBMITTED') return;

    setJustifications((prev) => ({
      ...prev,
      [questionId]: value,
    }));
  };

  // Handler para paste externo (anti-copy/paste)
  const handlePasteAttempt = async () => {
    if (!deviceTokenRef.current) return;
    await studentAPI.recordPasteAttempt(attemptId, deviceTokenRef.current);
  };

  const handleSubmit = async () => {
    if (!deviceTokenRef.current) return;

    setIsSubmitting(true);

    try {
      // Primero guardar respuestas actuales
      await saveAnswers(true);

      // Luego entregar
      const result = await studentAPI.submit(attemptId, deviceTokenRef.current);

      // Redirigir a página de resultados
      router.push(`/prueba/resultado/${result.resultsToken}`);
    } catch (err) {
      console.error('Error submitting:', err);
      alert('Error al entregar la prueba. Por favor intenta de nuevo.');
    } finally {
      setIsSubmitting(false);
      setShowSubmitModal(false);
    }
  };

  const handleRetrySave = () => {
    saveAnswers(true);
  };

  // Auto-submit cuando se acaba el tiempo
  const handleAutoSubmit = async () => {
    if (!deviceTokenRef.current) return;

    try {
      // Guardar respuestas actuales
      await saveAnswers(true);

      // Entregar
      const result = await studentAPI.submit(attemptId, deviceTokenRef.current);

      // Actualizar estado local
      setAttemptData(prev => prev ? { ...prev, status: 'SUBMITTED', submittedAt: result.submittedAt, resultsToken: result.resultsToken } : null);
    } catch (err) {
      console.error('Error auto-submitting:', err);
    }
  };

  // ============================================
  // CALCULAR PROGRESO
  // ============================================

  const totalQuestions = attemptData?.test.questions.length || 0;
  const answeredQuestions = Object.values(answers).filter((v) => v && v.trim() !== '').length;
  const isSubmitted = attemptData?.status === 'SUBMITTED';

  // ============================================
  // LOADING STATE
  // ============================================

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Cargando prueba...</p>
        </div>
      </div>
    );
  }

  // ============================================
  // ERROR STATE
  // ============================================

  if (error || !attemptData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-red-600 mb-2">{error || 'Error desconocido'}</p>
          <p className="text-gray-500 text-sm">Redirigiendo...</p>
        </div>
      </div>
    );
  }

  // ============================================
  // SUBMITTED STATE - Solo mostrar mensaje de éxito
  // ============================================

  if (attemptData.status === 'SUBMITTED') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md text-center">
          {/* Icono de éxito */}
          <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 rounded-full mb-6">
            <CheckCircle className="w-12 h-12 text-green-600" />
          </div>

          {/* Título */}
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Prueba entregada exitosamente
          </h1>

          {/* Nombre de la prueba */}
          <p className="text-gray-600 mb-6">
            {attemptData.test.title}
          </p>

          {/* Información de entrega */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-500">Estudiante</p>
                <p className="font-medium text-gray-900">{attemptData.studentName}</p>
              </div>
              <div>
                <p className="text-gray-500">Preguntas respondidas</p>
                <p className="font-medium text-gray-900">{answeredQuestions} de {totalQuestions}</p>
              </div>
              {attemptData.submittedAt && (
                <div className="col-span-2">
                  <p className="text-gray-500">Fecha de entrega</p>
                  <p className="font-medium text-gray-900">
                    {new Date(attemptData.submittedAt).toLocaleString('es-CL', {
                      dateStyle: 'long',
                      timeStyle: 'short',
                    })}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Mensaje sobre resultados */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-left">
            <div className="flex items-start gap-3">
              <Mail className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-blue-900 mb-1">
                  Tus resultados serán enviados por correo
                </p>
                {attemptData.studentEmail ? (
                  <p className="text-sm text-blue-700">
                    Los resultados se enviarán a: <strong>{attemptData.studentEmail}</strong>
                  </p>
                ) : (
                  <p className="text-sm text-blue-700">
                    Tu profesor te notificará cuando los resultados estén disponibles.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============================================
  // RENDER - Prueba en progreso
  // ============================================

  return (
    <div className="h-screen flex flex-col bg-gray-100 overflow-hidden">
      {/* Header fijo */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex-shrink-0 shadow-sm z-10">
        <div className="max-w-screen-2xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <FileText className="w-5 h-5 text-primary flex-shrink-0" />
            <h1 className="font-semibold text-gray-900 truncate">
              {attemptData.test.title}
            </h1>
          </div>
          <div className="flex items-center gap-4 flex-shrink-0">
            {/* Temporizador */}
            {timeRemaining !== null && timeRemaining > 0 && !isSubmitted && (
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-mono font-bold ${
                timeRemaining <= 300 ? 'bg-red-100 text-red-700 animate-pulse' : 'bg-blue-100 text-blue-700'
              }`}>
                <Timer className="w-4 h-4" />
                <span>{formatTimeRemaining(timeRemaining)}</span>
              </div>
            )}

            {/* Indicador de guardado */}
            {!isSubmitted && (
              <SaveIndicator status={saveStatus} onRetry={handleRetrySave} />
            )}

            <div className="hidden sm:flex items-center gap-2 text-sm text-gray-600">
              <User className="w-4 h-4" />
              <span>{attemptData.studentName}</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm font-medium">
              <span className={answeredQuestions === totalQuestions ? 'text-green-600' : 'text-gray-700'}>
                {answeredQuestions} de {totalQuestions}
              </span>
              <span className="text-gray-400 hidden sm:inline">respondidas</span>
            </div>
          </div>
        </div>
      </header>

      {/* Contenido principal */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
        {/* PDF - Desktop: lado izquierdo, Mobile: colapsable */}
        <div className="lg:w-1/2 lg:h-full flex-shrink-0">
          {/* Toggle móvil */}
          <button
            onClick={() => setShowPdfMobile(!showPdfMobile)}
            className="lg:hidden w-full bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between text-gray-700"
          >
            <span className="font-medium">Ver PDF de la prueba</span>
            {showPdfMobile ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </button>

          {/* Visor PDF */}
          <div className={`${showPdfMobile ? 'block' : 'hidden'} lg:block h-[50vh] lg:h-full bg-gray-800`}>
            {attemptData.test.pdfUrl ? (
              <iframe
                src={attemptData.test.pdfUrl}
                className="w-full h-full"
                title="PDF de la prueba"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-400">
                <p>PDF no disponible</p>
              </div>
            )}
          </div>
        </div>

        {/* Formulario de respuestas - Desktop: lado derecho con scroll, Mobile: abajo */}
        <div className="flex-1 lg:w-1/2 overflow-y-auto">
          <div className="p-4 sm:p-6 space-y-6">
            {attemptData.test.questions.map((question, idx) => {
              const prevSection = idx > 0 ? attemptData.test.questions[idx - 1].context : null;
              const currentSection = question.context;
              const showSectionHeader = currentSection && currentSection !== prevSection;

              return (
                <div key={question.id}>
                  {showSectionHeader && (
                    <div className={`flex items-center gap-3 ${idx > 0 ? 'mt-4' : ''} mb-2`}>
                      <div className="h-px flex-1 bg-gray-300" />
                      <span className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                        {currentSection}
                      </span>
                      <div className="h-px flex-1 bg-gray-300" />
                    </div>
                  )}
                  <QuestionCard
                    question={question}
                    value={answers[question.id] || ''}
                    onChange={(value) => handleAnswerChange(question.id, value)}
                    justification={justifications[question.id] || ''}
                    onJustificationChange={(value) => handleJustificationChange(question.id, value)}
                    requireFalseJustification={attemptData.test.requireFalseJustification}
                    onPasteAttempt={handlePasteAttempt}
                    disabled={isSubmitted}
                  />
                </div>
              );
            })}

            {/* Botón entregar */}
            {!isSubmitted && (
              <div className="pt-4 pb-8">
                <button
                  onClick={() => setShowSubmitModal(true)}
                  className="w-full btn-primary py-4 text-lg font-semibold flex items-center justify-center gap-2"
                >
                  <Send className="w-5 h-5" />
                  Entregar prueba
                </button>
                <p className="text-center text-sm text-gray-500 mt-2">
                  Una vez entregada, no podrás modificar tus respuestas
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal de confirmación */}
      {showSubmitModal && (
        <ConfirmModal
          onConfirm={handleSubmit}
          onCancel={() => setShowSubmitModal(false)}
          isLoading={isSubmitting}
          answeredCount={answeredQuestions}
          totalCount={totalQuestions}
        />
      )}

      {/* Modal de tiempo agotado */}
      {showTimeUpModal && (
        <TimeUpModal
          onClose={() => setShowTimeUpModal(false)}
          studentEmail={attemptData?.studentEmail}
        />
      )}
    </div>
  );
}

// ============================================
// COMPONENTE: INDICADOR DE GUARDADO
// ============================================

interface SaveIndicatorProps {
  status: SaveStatus;
  onRetry: () => void;
}

function SaveIndicator({ status, onRetry }: SaveIndicatorProps) {
  if (status === 'idle') {
    return null;
  }

  if (status === 'saving') {
    return (
      <div className="flex items-center gap-1.5 text-yellow-600 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="hidden sm:inline">Guardando...</span>
      </div>
    );
  }

  if (status === 'saved') {
    return (
      <div className="flex items-center gap-1.5 text-green-600 text-sm">
        <Save className="w-4 h-4" />
        <span className="hidden sm:inline">Guardado</span>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <button
        onClick={onRetry}
        className="flex items-center gap-1.5 text-red-600 text-sm hover:text-red-700"
      >
        <AlertCircle className="w-4 h-4" />
        <span className="hidden sm:inline">Error - Reintentar</span>
      </button>
    );
  }

  return null;
}

// ============================================
// COMPONENTE: MODAL DE CONFIRMACIÓN
// ============================================

interface ConfirmModalProps {
  onConfirm: () => void;
  onCancel: () => void;
  isLoading: boolean;
  answeredCount: number;
  totalCount: number;
}

function ConfirmModal({ onConfirm, onCancel, isLoading, answeredCount, totalCount }: ConfirmModalProps) {
  const unanswered = totalCount - answeredCount;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900">
            Confirmar entrega
          </h2>
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-gray-600 mb-4">
          ¿Seguro que deseas entregar la prueba? Una vez entregada, no podrás modificar tus respuestas.
        </p>

        {unanswered > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
            <p className="text-yellow-800 text-sm">
              <strong>Atención:</strong> Tienes {unanswered} {unanswered === 1 ? 'pregunta sin responder' : 'preguntas sin responder'}.
            </p>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="flex-1 py-2.5 px-4 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className="flex-1 py-2.5 px-4 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Entregando...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Entregar
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================
// COMPONENTE: TARJETA DE PREGUNTA
// ============================================

interface QuestionCardProps {
  question: Question;
  value: string;
  onChange: (value: string) => void;
  justification?: string;
  onJustificationChange?: (value: string) => void;
  requireFalseJustification?: boolean;
  onPasteAttempt?: () => void;
  disabled?: boolean;
}

function QuestionCard({ question, value, onChange, justification, onJustificationChange, requireFalseJustification, onPasteAttempt, disabled }: QuestionCardProps) {
  const isAnswered = value && value.trim() !== '';
  const hasText = !!(question.questionText && question.questionText.trim());

  return (
    <div className={`bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden ${disabled ? 'opacity-75' : ''}`}>
      {/* Header de pregunta */}
      <div className={`flex items-start gap-3 p-4 ${hasText ? 'border-b border-gray-100' : ''} bg-gray-50`}>
        <div className="flex-shrink-0">
          {isAnswered ? (
            <CheckCircle className="w-6 h-6 text-green-500" />
          ) : (
            <Circle className="w-6 h-6 text-gray-300" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-gray-900">
              Pregunta {question.questionLabel || question.questionNumber}
            </span>
            <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
              {question.points} {question.points === 1 ? 'punto' : 'puntos'}
            </span>
          </div>
          {hasText ? (
            <>
              {/* Contexto introductorio */}
              {question.context && (
                <div className="text-gray-600 text-sm mb-1">
                  <RichMathText text={question.context} />
                </div>
              )}
              {/* Imagen de la pregunta (entre contexto y pregunta) */}
              {(question.imageUrl || question.image_url) && (
                <div className="my-2">
                  <img
                    src={question.imageUrl || question.image_url || ''}
                    alt={question.imageDescription || question.image_description || 'Imagen de la pregunta'}
                    className="max-w-full max-h-72 object-contain rounded border border-gray-200"
                    loading="lazy"
                  />
                </div>
              )}
              {/* Texto de la pregunta */}
              <div className="text-gray-700">
                <RichMathText text={question.questionText} />
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-400 italic">Consulta el PDF para ver la pregunta</p>
          )}
        </div>
      </div>

      {/* Input según tipo */}
      <div className="p-4">
        {question.type === 'TRUE_FALSE' && (
          <TrueFalseInput
            value={value}
            onChange={onChange}
            disabled={disabled}
            justification={justification}
            onJustificationChange={onJustificationChange}
            requireJustification={requireFalseJustification}
            onPasteAttempt={onPasteAttempt}
          />
        )}
        {question.type === 'MULTIPLE_CHOICE' && (
          <MultipleChoiceInput
            options={question.options || []}
            value={value}
            onChange={onChange}
            disabled={disabled}
          />
        )}
        {question.type === 'DEVELOPMENT' && (
          <DevelopmentInput value={value} onChange={onChange} disabled={disabled} onPasteAttempt={onPasteAttempt} />
        )}
        {question.type === 'MATH' && (
          <MathInput value={value} onChange={onChange} disabled={disabled} onPasteAttempt={onPasteAttempt} />
        )}
      </div>
    </div>
  );
}

// ============================================
// INPUTS POR TIPO
// ============================================

interface InputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  onPasteAttempt?: () => void;
}

interface TrueFalseInputProps extends InputProps {
  justification?: string;
  onJustificationChange?: (value: string) => void;
  requireJustification?: boolean;
}

// Verdadero / Falso
function TrueFalseInput({ value, onChange, disabled, justification, onJustificationChange, requireJustification, onPasteAttempt }: TrueFalseInputProps) {
  const showJustificationField = requireJustification && value === 'F';

  // Handler para paste en justificación
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pastedText = e.clipboardData.getData('text');
    const currentText = e.currentTarget.value || '';

    // Permitir si el texto pegado ya está en el campo (cortar y pegar interno)
    if (currentText.includes(pastedText)) {
      return;
    }

    // Bloquear paste externo y registrar
    e.preventDefault();
    onPasteAttempt?.();
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => !disabled && onChange('V')}
          disabled={disabled}
          className={`flex-1 py-3 px-4 rounded-lg border-2 font-medium transition-all ${
            value === 'V'
              ? 'border-blue-500 bg-blue-50 text-blue-700'
              : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
          } ${disabled ? 'cursor-not-allowed' : ''}`}
        >
          Verdadero
        </button>
        <button
          type="button"
          onClick={() => !disabled && onChange('F')}
          disabled={disabled}
          className={`flex-1 py-3 px-4 rounded-lg border-2 font-medium transition-all ${
            value === 'F'
              ? 'border-blue-500 bg-blue-50 text-blue-700'
              : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
          } ${disabled ? 'cursor-not-allowed' : ''}`}
        >
          Falso
        </button>
      </div>

      {/* Campo de justificación para respuestas Falsas */}
      {showJustificationField && (
        <div className="mt-3">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Justifica tu respuesta:
          </label>
          <textarea
            value={justification || ''}
            onChange={(e) => onJustificationChange?.(e.target.value)}
            onPaste={handlePaste}
            placeholder="Explica por qué la afirmación es falsa..."
            rows={3}
            disabled={disabled}
            className={`w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-y text-gray-900 ${
              disabled ? 'bg-gray-50 cursor-not-allowed' : ''
            }`}
          />
          <p className="text-xs text-gray-500 mt-1">
            Requerido para respuestas Falsas
          </p>
        </div>
      )}
    </div>
  );
}

// Múltiple opción
interface MultipleChoiceInputProps extends InputProps {
  options: string[];
}

function MultipleChoiceInput({ options, value, onChange, disabled }: MultipleChoiceInputProps) {
  const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  // Compact "bubble sheet" mode: options are just letters (e.g. ["A","B","C","D"])
  const isLetterOnly = options.every(opt => /^[A-H]$/.test(opt.trim()));

  if (isLetterOnly) {
    return (
      <div className="flex gap-3 flex-wrap">
        {options.map((option, index) => {
          const letter = letters[index] || String(index + 1);
          const isSelected = value === letter;
          return (
            <button
              key={index}
              type="button"
              onClick={() => !disabled && onChange(letter)}
              disabled={disabled}
              className={`w-12 h-12 rounded-full border-2 transition-all flex items-center justify-center text-base font-bold ${
                isSelected
                  ? 'border-primary bg-primary text-white shadow-md scale-110'
                  : 'border-gray-300 bg-white text-gray-600 hover:border-primary/50 hover:bg-primary/5'
              } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
            >
              {letter}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {options.map((option, index) => {
        const letter = letters[index] || String(index + 1);
        const isSelected = value === letter;

        return (
          <button
            key={index}
            type="button"
            onClick={() => !disabled && onChange(letter)}
            disabled={disabled}
            className={`w-full text-left py-3 px-4 rounded-lg border-2 transition-all flex items-start gap-3 ${
              isSelected
                ? 'border-primary bg-primary/5 text-gray-900'
                : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
            } ${disabled ? 'cursor-not-allowed' : ''}`}
          >
            <span
              className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-semibold ${
                isSelected
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              {letter}
            </span>
            <span className="pt-0.5">
              <RichMathText text={option.replace(/^[A-Z]\)\s*/, '')} />
            </span>
          </button>
        );
      })}
    </div>
  );
}

// Desarrollo
function DevelopmentInput({ value, onChange, disabled, onPasteAttempt }: InputProps) {
  // Handler para paste externo
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pastedText = e.clipboardData.getData('text');
    const currentText = e.currentTarget.value || '';

    // Permitir si el texto pegado ya está en el campo (cortar y pegar interno)
    if (currentText.includes(pastedText)) {
      return;
    }

    // Bloquear paste externo y registrar
    e.preventDefault();
    onPasteAttempt?.();
  };

  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onPaste={handlePaste}
      placeholder="Escribe tu respuesta..."
      rows={4}
      disabled={disabled}
      className={`w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-y text-gray-900 ${
        disabled ? 'bg-gray-50 cursor-not-allowed' : ''
      }`}
    />
  );
}

// Matemática con MathLive
function MathInput({ value, onChange, disabled }: InputProps) {
  return (
    <MathField
      value={value}
      onChange={onChange}
      disabled={disabled}
      placeholder="Escribe tu resultado aquí"
    />
  );
}

// ============================================
// COMPONENTE: MODAL DE TIEMPO AGOTADO
// ============================================

interface TimeUpModalProps {
  onClose: () => void;
  studentEmail?: string | null;
}

function TimeUpModal({ onClose, studentEmail }: TimeUpModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-amber-100 rounded-full mb-4">
          <Clock className="w-8 h-8 text-amber-600" />
        </div>

        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          Prueba finalizada
        </h2>

        <p className="text-gray-600 mb-4">
          El tiempo de la prueba ha terminado. Tus respuestas han sido guardadas y entregadas automáticamente.
        </p>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 text-left">
          <div className="flex items-start gap-3">
            <Mail className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-blue-900 text-sm mb-1">
                Los resultados serán enviados por correo
              </p>
              {studentEmail ? (
                <p className="text-xs text-blue-700">
                  Se enviarán a: <strong>{studentEmail}</strong>
                </p>
              ) : (
                <p className="text-xs text-blue-700">
                  Tu profesor te notificará cuando estén disponibles.
                </p>
              )}
            </div>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full py-3 px-4 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 flex items-center justify-center gap-2"
        >
          <CheckCircle className="w-5 h-5" />
          Entendido
        </button>
      </div>
    </div>
  );
}
