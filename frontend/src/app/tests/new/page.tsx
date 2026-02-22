'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import ProtectedRoute from '@/components/ProtectedRoute';
import Navbar from '@/components/Navbar';
import { testsAPI, coursesAPI } from '@/lib/api';
import { Test, Question, Course } from '@/types';
import { ArrowLeft, Upload, Sparkles, FileText, Users, AlertCircle } from 'lucide-react';
import { ROUTES } from '@/config/constants';

// ============================================
// VALIDACIÓN
// ============================================

const createTestSchema = z.object({
  title: z.string().min(3, 'El título debe tener al menos 3 caracteres'),
  courseId: z.string().min(1, 'Debes seleccionar un curso'),
});

type CreateTestFormData = z.infer<typeof createTestSchema>;

// ============================================
// ESTADOS DEL COMPONENTE
// ============================================

type PageState = 'form' | 'upload' | 'analyzing' | 'results';

export default function NewTestPage() {
  const router = useRouter();
  const [pageState, setPageState] = useState<PageState>('form');
  const [currentTest, setCurrentTest] = useState<Test | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [detectedQuestions, setDetectedQuestions] = useState<Question[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysisProgress, setAnalysisProgress] = useState<{
    batch: number;
    totalBatches: number;
    pages: string;
    questionsFound: number;
    message: string;
  } | null>(null);

  // Cursos
  const [courses, setCourses] = useState<Course[]>([]);
  const [isLoadingCourses, setIsLoadingCourses] = useState(true);

  const form = useForm<CreateTestFormData>({
    resolver: zodResolver(createTestSchema),
    defaultValues: {
      title: '',
      courseId: '',
    },
  });

  // Cargar cursos al montar
  useEffect(() => {
    loadCourses();
  }, []);

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

  // ============================================
  // HANDLERS
  // ============================================

  // Paso 1: Crear prueba
  const handleCreateTest = async (data: CreateTestFormData) => {
    try {
      setIsLoading(true);
      setError(null);

      const test = await testsAPI.create({
        title: data.title,
        courseId: data.courseId,
      });
      setCurrentTest(test);
      setPageState('upload');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear la prueba');
    } finally {
      setIsLoading(false);
    }
  };

  // Paso 2: Seleccionar archivo
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type !== 'application/pdf') {
        setError('Solo se permiten archivos PDF');
        return;
      }
      setSelectedFile(file);
      setError(null);
    }
  };

  // Paso 3: Subir PDF
  const handleUploadPDF = async () => {
    if (!selectedFile || !currentTest) return;

    try {
      setIsLoading(true);
      setError(null);

      await testsAPI.uploadPDF(currentTest.id, selectedFile);
      // Continuar automáticamente al análisis
      await handleAnalyzePDF();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al subir el PDF');
      setIsLoading(false);
    }
  };

  // Paso 4: Analizar con IA
  const handleAnalyzePDF = async () => {
    if (!currentTest || !selectedFile) return;

    try {
      setPageState('analyzing');
      setError(null);
      setAnalysisProgress(null);

      const response = await testsAPI.analyzePDF(currentTest.id, selectedFile, (progress) => {
        setAnalysisProgress(progress);
      });
      setDetectedQuestions(response.questions);
      setPageState('results');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al analizar el PDF');
      setPageState('upload');
    } finally {
      setIsLoading(false);
      setAnalysisProgress(null);
    }
  };

  // Continuar a editar preguntas
  const handleContinue = () => {
    if (currentTest) {
      router.push(ROUTES.TEST_DETAIL(currentTest.id));
    }
  };

  const handleBack = () => {
    router.push(ROUTES.DASHBOARD);
  };

  // ============================================
  // RENDER
  // ============================================

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
            Volver
          </button>

          {/* Title */}
          <h1 className="text-3xl font-bold text-gray-900 mb-8">
            Crear Nueva Prueba
          </h1>

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* STEP 1: FORM */}
          {pageState === 'form' && (
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                Información de la Prueba
              </h2>

              {/* No courses warning */}
              {!isLoadingCourses && courses.length === 0 && (
                <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-md">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-amber-800 font-medium">
                        Primero debes crear un curso
                      </p>
                      <p className="text-sm text-amber-700 mt-1">
                        Para crear una prueba necesitas tener al menos un curso con estudiantes.
                      </p>
                      <Link
                        href={ROUTES.NEW_COURSE}
                        className="inline-flex items-center gap-2 mt-3 text-sm font-medium text-amber-800 hover:text-amber-900"
                      >
                        <Users className="w-4 h-4" />
                        Crear mi primer curso
                      </Link>
                    </div>
                  </div>
                </div>
              )}

              {/* Form */}
              {(isLoadingCourses || courses.length > 0) && (
                <form onSubmit={form.handleSubmit(handleCreateTest)} className="space-y-4">
                  {/* Curso selector */}
                  <div>
                    <label htmlFor="courseId" className="block text-sm font-medium text-gray-700 mb-1">
                      Curso *
                    </label>
                    {isLoadingCourses ? (
                      <div className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50">
                        <span className="text-gray-500">Cargando cursos...</span>
                      </div>
                    ) : (
                      <select
                        id="courseId"
                        {...form.register('courseId')}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-gray-900"
                      >
                        <option value="">Selecciona un curso</option>
                        {courses.map((course) => (
                          <option key={course.id} value={course.id}>
                            {course.name} ({course.year}) - {course._count?.students || 0} estudiantes
                          </option>
                        ))}
                      </select>
                    )}
                    {form.formState.errors.courseId && (
                      <p className="mt-1 text-sm text-red-600">
                        {form.formState.errors.courseId.message}
                      </p>
                    )}
                  </div>

                  {/* Título */}
                  <div>
                    <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
                      Título *
                    </label>
                    <input
                      id="title"
                      type="text"
                      {...form.register('title')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-gray-900"
                      placeholder="Ej: Evaluación de Física - Unidad 3"
                    />
                    {form.formState.errors.title && (
                      <p className="mt-1 text-sm text-red-600">
                        {form.formState.errors.title.message}
                      </p>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading || isLoadingCourses || courses.length === 0}
                    className="w-full btn-primary py-3 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isLoading ? 'Creando...' : 'Crear Prueba'}
                  </button>
                </form>
              )}
            </div>
          )}

          {/* STEP 2: UPLOAD PDF */}
          {pageState === 'upload' && (
            <div className="space-y-6">
              {/* Course info */}
              {currentTest?.course && (
                <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                  <div className="flex items-center gap-2 text-blue-800">
                    <Users className="w-4 h-4" />
                    <span className="font-medium">Curso:</span>
                    <span>{currentTest.course.name} ({currentTest.course.year})</span>
                  </div>
                </div>
              )}

              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">
                  Subir PDF de la Prueba
                </h2>

                <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                  <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />

                  {!selectedFile ? (
                    <>
                      <p className="text-gray-600 mb-4">
                        Selecciona el archivo PDF de tu prueba
                      </p>
                      <label className="cursor-pointer">
                        <input
                          type="file"
                          accept=".pdf"
                          onChange={handleFileChange}
                          className="hidden"
                        />
                        <span className="btn-primary px-6 py-2 inline-block">
                          Seleccionar PDF
                        </span>
                      </label>
                    </>
                  ) : (
                    <>
                      <FileText className="w-12 h-12 text-primary mx-auto mb-4" />
                      <p className="text-gray-900 font-medium mb-2">
                        {selectedFile.name}
                      </p>
                      <p className="text-sm text-gray-500 mb-4">
                        {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                      <div className="flex gap-3 justify-center">
                        <label className="cursor-pointer">
                          <input
                            type="file"
                            accept=".pdf"
                            onChange={handleFileChange}
                            className="hidden"
                          />
                          <span className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 inline-block">
                            Cambiar archivo
                          </span>
                        </label>
                        <button
                          onClick={handleUploadPDF}
                          disabled={isLoading}
                          className="btn-primary px-6 py-2 flex items-center gap-2 disabled:opacity-50"
                        >
                          <Sparkles className="w-4 h-4" />
                          {isLoading ? 'Analizando...' : 'Analizar con IA'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: ANALYZING */}
          {pageState === 'analyzing' && (
            <div className="bg-white rounded-lg shadow-md p-8">
              <div className="text-center">
                <Sparkles className="w-16 h-16 text-primary mx-auto mb-4 animate-pulse" />
                <h2 className="text-xl font-semibold text-gray-900 mb-2">
                  Analizando PDF con IA...
                </h2>
                {analysisProgress ? (
                  <div className="mt-4">
                    <div className="w-full bg-gray-200 rounded-full h-2.5 mb-3">
                      <div
                        className="bg-primary h-2.5 rounded-full transition-all duration-500"
                        style={{ width: `${(analysisProgress.batch / analysisProgress.totalBatches) * 100}%` }}
                      />
                    </div>
                    <p className="text-gray-600 text-sm">
                      {analysisProgress.message}
                    </p>
                    {analysisProgress.questionsFound > 0 && (
                      <p className="text-gray-500 text-xs mt-1">
                        {analysisProgress.questionsFound} preguntas encontradas hasta ahora
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-gray-600">
                    Preparando el análisis...
                  </p>
                )}
              </div>
            </div>
          )}

          {/* STEP 4: RESULTS */}
          {pageState === 'results' && (
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-2">
                  Análisis Completado
                </h2>
                <p className="text-gray-600">
                  Se detectaron {detectedQuestions.length} preguntas. Ahora puedes configurar las respuestas correctas.
                </p>
              </div>

              {/* Lista de preguntas detectadas */}
              <div className="space-y-3 mb-6">
                {detectedQuestions.slice(0, 5).map((question, index) => {
                  const questionText = question.questionText || question.question_text || '';
                  const questionType = question.questionType || question.type || '';

                  return (
                    <div key={question.id} className="p-3 bg-gray-50 rounded-md">
                      <p className="text-sm font-medium text-gray-700">
                        {index + 1}. {questionText.substring(0, 100)}
                        {questionText.length > 100 ? '...' : ''}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        Tipo: {questionType} • {question.points} puntos
                      </p>
                    </div>
                  );
                })}
                {detectedQuestions.length > 5 && (
                  <p className="text-sm text-gray-500 text-center">
                    ... y {detectedQuestions.length - 5} preguntas más
                  </p>
                )}
              </div>

              <button
                onClick={handleContinue}
                className="w-full btn-primary py-3"
              >
                Continuar a Configurar Respuestas
              </button>
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
