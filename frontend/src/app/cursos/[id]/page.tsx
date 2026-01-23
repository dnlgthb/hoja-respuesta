'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import ProtectedRoute from '@/components/ProtectedRoute';
import Navbar from '@/components/Navbar';
import { coursesAPI } from '@/lib/api';
import { Course, CourseStudent } from '@/types';
import {
  ArrowLeft,
  Users,
  Trash2,
  Upload,
  Plus,
  X,
  FileSpreadsheet,
  AlertCircle,
  Check,
  Pencil,
  Save,
} from 'lucide-react';
import { ROUTES } from '@/config/constants';

interface ParsedStudent {
  student_name: string;
  student_email?: string;
}

export default function CursoDetallePage() {
  const router = useRouter();
  const params = useParams();
  const courseId = params.id as string;

  // Course state
  const [course, setCourse] = useState<Course | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit mode
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editYear, setEditYear] = useState<number>(2025);
  const [isSaving, setIsSaving] = useState(false);

  // Delete course
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Manual add student
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualEmail, setManualEmail] = useState('');
  const [isAddingManual, setIsAddingManual] = useState(false);

  // File upload
  const [isDragging, setIsDragging] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  // Load course
  const loadCourse = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await coursesAPI.getById(courseId);
      setCourse(data);
      setEditName(data.name);
      setEditYear(data.year);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar el curso');
    } finally {
      setIsLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    loadCourse();
  }, [loadCourse]);

  // Handle edit save
  const handleSaveEdit = async () => {
    if (!editName.trim()) return;

    try {
      setIsSaving(true);
      await coursesAPI.update(courseId, { name: editName.trim(), year: editYear });
      setIsEditing(false);
      await loadCourse();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al actualizar');
    } finally {
      setIsSaving(false);
    }
  };

  // Handle delete course
  const handleDeleteCourse = async () => {
    try {
      setIsDeleting(true);
      await coursesAPI.delete(courseId);
      router.push(ROUTES.COURSES);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al eliminar');
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  // Handle delete student
  const handleDeleteStudent = async (studentId: string) => {
    if (!confirm('¿Eliminar este estudiante del curso?')) return;

    try {
      await coursesAPI.deleteStudent(courseId, studentId);
      await loadCourse();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al eliminar estudiante');
    }
  };

  // Handle manual add
  const handleManualAdd = async () => {
    if (!manualName.trim()) return;

    try {
      setIsAddingManual(true);
      await coursesAPI.addStudents(courseId, {
        students: [{ student_name: manualName.trim(), student_email: manualEmail.trim() || undefined }],
      });
      setManualName('');
      setManualEmail('');
      setShowManualAdd(false);
      await loadCourse();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al agregar estudiante');
    } finally {
      setIsAddingManual(false);
    }
  };

  // File upload handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    validateAndSetFile(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) validateAndSetFile(file);
  };

  const validateAndSetFile = (file: File) => {
    setUploadError(null);
    setUploadSuccess(null);

    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
      'application/csv',
    ];
    const validExtensions = ['.xlsx', '.xls', '.csv'];
    const hasValidExtension = validExtensions.some((ext) => file.name.toLowerCase().endsWith(ext));

    if (!validTypes.includes(file.type) && !hasValidExtension) {
      setUploadError('Solo se permiten archivos Excel (.xlsx, .xls) o CSV (.csv)');
      return;
    }

    setUploadFile(file);
  };

  const handleUpload = async () => {
    if (!uploadFile) return;

    try {
      setIsUploading(true);
      setUploadError(null);
      setUploadSuccess(null);

      const result = await coursesAPI.uploadStudents(courseId, uploadFile);
      setUploadSuccess(result.message);
      setUploadFile(null);
      await loadCourse();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Error al procesar el archivo');
    } finally {
      setIsUploading(false);
    }
  };

  const cancelUpload = () => {
    setUploadFile(null);
    setUploadError(null);
    setUploadSuccess(null);
  };

  if (isLoading) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gray-50">
          <Navbar />
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-gray-600">Cargando curso...</p>
            </div>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  if (error || !course) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gray-50">
          <Navbar />
          <div className="max-w-4xl mx-auto px-6 py-8">
            <div className="p-4 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-600">{error || 'Curso no encontrado'}</p>
            </div>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        <Navbar />

        <div className="max-w-4xl mx-auto px-6 py-8">
          {/* Back Button */}
          <button
            onClick={() => router.push(ROUTES.COURSES)}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver a cursos
          </button>

          {/* Course Header */}
          <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
            {isEditing ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary focus:border-primary text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Año</label>
                  <input
                    type="number"
                    value={editYear}
                    onChange={(e) => setEditYear(Number(e.target.value))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary focus:border-primary text-gray-900"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveEdit}
                    disabled={isSaving}
                    className="btn-primary px-4 py-2 flex items-center gap-2"
                  >
                    <Save className="w-4 h-4" />
                    {isSaving ? 'Guardando...' : 'Guardar'}
                  </button>
                  <button
                    onClick={() => setIsEditing(false)}
                    className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">{course.name}</h2>
                  <p className="text-gray-600 mt-1">Año {course.year}</p>
                  <div className="flex items-center gap-2 mt-2 text-gray-600">
                    <Users className="w-4 h-4" />
                    <span>{course.students?.length || 0} estudiantes</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setIsEditing(true)}
                    className="p-2 text-gray-600 hover:text-primary hover:bg-gray-100 rounded-md"
                    title="Editar"
                  >
                    <Pencil className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-md"
                    title="Eliminar"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Add Students Section */}
          <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Agregar Estudiantes</h3>

            {/* Upload Area */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                isDragging
                  ? 'border-primary bg-primary/5'
                  : 'border-gray-300 hover:border-gray-400'
              }`}
            >
              {!uploadFile ? (
                <>
                  <FileSpreadsheet className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                  <p className="text-gray-600 mb-2">
                    Arrastra un archivo Excel o CSV aquí
                  </p>
                  <p className="text-sm text-gray-500 mb-4">
                    El archivo debe tener una columna "nombre" (o similar)
                  </p>
                  <label className="inline-flex items-center gap-2 btn-primary px-4 py-2 cursor-pointer">
                    <Upload className="w-4 h-4" />
                    Seleccionar archivo
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                  </label>
                </>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-center gap-2 text-gray-700">
                    <FileSpreadsheet className="w-6 h-6 text-primary" />
                    <span className="font-medium">{uploadFile.name}</span>
                    <button
                      onClick={cancelUpload}
                      className="p-1 text-gray-400 hover:text-gray-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <button
                    onClick={handleUpload}
                    disabled={isUploading}
                    className="btn-primary px-6 py-2 flex items-center gap-2 mx-auto"
                  >
                    {isUploading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        Procesando...
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4" />
                        Subir y agregar estudiantes
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* Upload Messages */}
            {uploadError && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-600">{uploadError}</p>
              </div>
            )}

            {uploadSuccess && (
              <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-md flex items-start gap-2">
                <Check className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-green-600">{uploadSuccess}</p>
              </div>
            )}

            {/* Manual Add */}
            <div className="mt-4 pt-4 border-t border-gray-200">
              {!showManualAdd ? (
                <button
                  onClick={() => setShowManualAdd(true)}
                  className="flex items-center gap-2 text-primary hover:text-primary/80"
                >
                  <Plus className="w-4 h-4" />
                  Agregar estudiante manualmente
                </button>
              ) : (
                <div className="space-y-3">
                  <div className="flex gap-3">
                    <input
                      type="text"
                      value={manualName}
                      onChange={(e) => setManualName(e.target.value)}
                      placeholder="Nombre del estudiante"
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary focus:border-primary text-gray-900 placeholder:text-gray-400"
                    />
                    <input
                      type="email"
                      value={manualEmail}
                      onChange={(e) => setManualEmail(e.target.value)}
                      placeholder="Email (opcional)"
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary focus:border-primary text-gray-900 placeholder:text-gray-400"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleManualAdd}
                      disabled={isAddingManual || !manualName.trim()}
                      className="btn-primary px-4 py-2 flex items-center gap-2"
                    >
                      {isAddingManual ? 'Agregando...' : 'Agregar'}
                    </button>
                    <button
                      onClick={() => {
                        setShowManualAdd(false);
                        setManualName('');
                        setManualEmail('');
                      }}
                      className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Students List */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Estudiantes ({course.students?.length || 0})
            </h3>

            {!course.students || course.students.length === 0 ? (
              <p className="text-gray-500 text-center py-8">
                No hay estudiantes en este curso aún
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-4 font-medium text-gray-700">Nombre</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-700">Email</th>
                      <th className="w-16"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {course.students.map((student) => (
                      <tr key={student.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-3 px-4 text-gray-900">{student.student_name}</td>
                        <td className="py-3 px-4 text-gray-600">
                          {student.student_email || (
                            <span className="text-gray-400 italic">sin email</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <button
                            onClick={() => handleDeleteStudent(student.id)}
                            className="p-1 text-gray-400 hover:text-red-600"
                            title="Eliminar estudiante"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Delete Confirmation Modal */}
          {showDeleteConfirm && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  ¿Eliminar curso?
                </h3>
                <p className="text-gray-600 mb-6">
                  Esta acción eliminará el curso "{course.name}" y todos sus estudiantes. Esta acción no se puede deshacer.
                </p>
                <div className="flex gap-3 justify-end">
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    disabled={isDeleting}
                    className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleDeleteCourse}
                    disabled={isDeleting}
                    className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 flex items-center gap-2"
                  >
                    {isDeleting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        Eliminando...
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-4 h-4" />
                        Eliminar
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
