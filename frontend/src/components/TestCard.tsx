'use client';

import { useRouter } from 'next/navigation';
import { Test } from '@/types';
import { Calendar, FileText, Trash2, Eye } from 'lucide-react';
import { ROUTES } from '@/config/constants';

interface TestCardProps {
  test: Test;
  onDelete: (id: string) => void;
}

export default function TestCard({ test, onDelete }: TestCardProps) {
  const router = useRouter();

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-CL', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
    });
  };

  const handleView = () => {
    router.push(ROUTES.TEST_DETAIL(test.id));
  };

  const handleDelete = () => {
    if (confirm(`¿Estás seguro de eliminar la prueba "${test.title}"?`)) {
      onDelete(test.id);
    }
  };

  // Soportar tanto camelCase como snake_case del backend
  const createdAt = test.createdAt || test.created_at || '';
  const isActive = test.isActive ?? test.is_active ?? (test as any).status === 'ACTIVE';

  return (
    <div className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow p-6 border border-gray-200">
      {/* Título */}
      <div className="mb-3">
        <h3 className="text-lg font-semibold text-gray-900 mb-1">
          {test.title}
        </h3>
        {test.subject && (
          <p className="text-sm text-gray-600">{test.subject}</p>
        )}
      </div>

      {/* Información adicional */}
      <div className="space-y-2 mb-4">
        {/* Fecha de creación */}
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Calendar className="w-4 h-4" />
          <span>{formatDate(createdAt)}</span>
        </div>

        {/* Número de preguntas (si existe) */}
        {test.questions && test.questions.length > 0 && (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <FileText className="w-4 h-4" />
            <span>{test.questions.length} preguntas</span>
          </div>
        )}
      </div>

      {/* Estado */}
      <div className="mb-4">
        {isActive ? (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
            Activa
          </span>
        ) : (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
            Inactiva
          </span>
        )}
      </div>

      {/* Botones de acción */}
      <div className="flex gap-2">
        <button
          onClick={handleView}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark transition-colors text-sm font-medium"
        >
          <Eye className="w-4 h-4" />
          Ver
        </button>
        <button
          onClick={handleDelete}
          className="px-4 py-2 bg-red-50 text-red-600 rounded-md hover:bg-red-100 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
