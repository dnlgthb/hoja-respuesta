'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import ProtectedRoute from '@/components/ProtectedRoute';
import Navbar from '@/components/Navbar';
import { coursesAPI } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth';
import { Course } from '@/types';
import { Plus, Users, BookOpen, Calendar, Building2 } from 'lucide-react';
import { ROUTES } from '@/config/constants';

export default function CursosPage() {
  const router = useRouter();
  const [courses, setCourses] = useState<Course[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const currentUser = getCurrentUser();
  const isAdmin = currentUser?.is_institution_admin === true;

  useEffect(() => {
    loadCourses();
  }, []);

  const loadCourses = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await coursesAPI.list();
      setCourses(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar los cursos');
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewCourse = () => {
    router.push(ROUTES.NEW_COURSE);
  };

  const handleNewInstitutionalCourse = () => {
    router.push(`${ROUTES.NEW_COURSE}?institutional=true`);
  };

  const handleCourseClick = (id: string) => {
    router.push(ROUTES.COURSE_DETAIL(id));
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-[#FBF9F3]">
        <Navbar />

        <div className="max-w-7xl mx-auto px-6 py-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-bold text-gray-900">Mis Cursos</h2>
            <div className="flex items-center gap-3">
              {isAdmin && (
                <button
                  onClick={handleNewInstitutionalCourse}
                  className="flex items-center gap-2 px-5 py-3 rounded-md font-medium text-white bg-indigo-600 hover:bg-indigo-700 transition-colors"
                >
                  <Building2 className="w-5 h-5" />
                  Curso Institucional
                </button>
              )}
              <button
                onClick={handleNewCourse}
                className="flex items-center gap-2 btn-primary px-6 py-3"
              >
                <Plus className="w-5 h-5" />
                Nuevo Curso
              </button>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* Loading State */}
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-gray-600">Cargando cursos...</p>
              </div>
            </div>
          )}

          {/* Empty State */}
          {!isLoading && !error && courses.length === 0 && (
            <div className="text-center py-12">
              <div className="mb-4">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Users className="w-8 h-8 text-gray-400" />
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  No tienes cursos aún
                </h3>
                <p className="text-gray-600 mb-6">
                  Crea un curso para agregar estudiantes y asociar pruebas
                </p>
                <button
                  onClick={handleNewCourse}
                  className="btn-primary px-6 py-3"
                >
                  Crear Primer Curso
                </button>
              </div>
            </div>
          )}

          {/* Courses Grid */}
          {!isLoading && !error && courses.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {courses.map((course) => {
                const isInstitutional = !!course.institution_id;
                const isOwner = course.teacher_id === currentUser?.id;

                return (
                  <div
                    key={course.id}
                    onClick={() => handleCourseClick(course.id)}
                    className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-md hover:border-primary/50 transition-all cursor-pointer"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <h3 className="text-lg font-semibold text-gray-900">
                        {course.name}
                      </h3>
                      {isInstitutional && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700">
                          <Building2 className="w-3 h-3" />
                          Institucional
                        </span>
                      )}
                    </div>

                    {isInstitutional && !isOwner && course.teacher && (
                      <p className="text-xs text-gray-500 mb-2">
                        Creado por {course.teacher.name}
                      </p>
                    )}

                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-gray-600">
                        <Calendar className="w-4 h-4" />
                        <span className="text-sm">Año {course.year}</span>
                      </div>

                      <div className="flex items-center gap-2 text-gray-600">
                        <Users className="w-4 h-4" />
                        <span className="text-sm">
                          {course._count?.students || 0} estudiantes
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-gray-600">
                        <BookOpen className="w-4 h-4" />
                        <span className="text-sm">
                          {course._count?.tests || 0} pruebas
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
