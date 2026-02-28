'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import ProtectedRoute from '@/components/ProtectedRoute';
import Navbar from '@/components/Navbar';
import { coursesAPI } from '@/lib/api';
import { ArrowLeft, Save, Building2 } from 'lucide-react';
import { ROUTES } from '@/config/constants';

const courseSchema = z.object({
  name: z.string().min(1, 'El nombre del curso es requerido').max(100, 'Máximo 100 caracteres'),
  year: z.number().min(2020, 'Año inválido').max(2100, 'Año inválido'),
});

type CourseFormData = z.infer<typeof courseSchema>;

export default function NuevoCursoPage() {
  return (
    <Suspense>
      <NuevoCursoContent />
    </Suspense>
  );
}

function NuevoCursoContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isInstitutional = searchParams.get('institutional') === 'true';
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentYear = new Date().getFullYear();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CourseFormData>({
    resolver: zodResolver(courseSchema),
    defaultValues: {
      name: '',
      year: currentYear,
    },
  });

  const onSubmit = async (data: CourseFormData) => {
    try {
      setIsLoading(true);
      setError(null);

      const course = await coursesAPI.create({
        ...data,
        ...(isInstitutional ? { institutional: true } : {}),
      });
      router.push(ROUTES.COURSE_DETAIL(course.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear el curso');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-[#FBF9F3]">
        <Navbar />

        <div className="max-w-2xl mx-auto px-6 py-8">
          {/* Back Button */}
          <button
            onClick={() => router.push(ROUTES.COURSES)}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver a cursos
          </button>

          {/* Header */}
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            {isInstitutional ? 'Crear Curso Institucional' : 'Crear Nuevo Curso'}
          </h2>

          {/* Institutional Banner */}
          {isInstitutional && (
            <div className="mb-6 p-4 bg-indigo-50 border border-indigo-200 rounded-md flex items-start gap-3">
              <Building2 className="w-5 h-5 text-indigo-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-indigo-800">
                Este curso será visible para todos los profesores de tu institución. Solo tú podrás editarlo y gestionar sus estudiantes.
              </p>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="space-y-6">
              {/* Nombre del curso */}
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                  Nombre del curso
                </label>
                <input
                  type="text"
                  id="name"
                  {...register('name')}
                  placeholder="Ej: 3° Medio A"
                  className="w-full px-4 py-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary focus:border-primary text-gray-900 placeholder:text-gray-400"
                />
                {errors.name && (
                  <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>
                )}
              </div>

              {/* Año */}
              <div>
                <label htmlFor="year" className="block text-sm font-medium text-gray-700 mb-2">
                  Año
                </label>
                <input
                  type="number"
                  id="year"
                  {...register('year', { valueAsNumber: true })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary focus:border-primary text-gray-900"
                />
                {errors.year && (
                  <p className="mt-1 text-sm text-red-600">{errors.year.message}</p>
                )}
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading}
                className={`w-full py-3 flex items-center justify-center gap-2 rounded-md font-medium text-white transition-colors ${
                  isInstitutional
                    ? 'bg-indigo-600 hover:bg-indigo-700'
                    : 'btn-primary'
                }`}
              >
                {isLoading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Creando...
                  </>
                ) : (
                  <>
                    {isInstitutional ? <Building2 className="w-5 h-5" /> : <Save className="w-5 h-5" />}
                    {isInstitutional ? 'Crear Curso Institucional' : 'Crear Curso'}
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </ProtectedRoute>
  );
}
