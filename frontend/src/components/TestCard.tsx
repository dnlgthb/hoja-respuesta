'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Test } from '@/types';
import { Calendar, FileText, Trash2, Eye, Copy, CheckCircle, Clock, Edit3 } from 'lucide-react';
import { ROUTES } from '@/config/constants';

interface TestCardProps {
  test: Test;
  onDelete: (id: string) => void;
  onDuplicate?: (id: string) => void;
}

export default function TestCard({ test, onDelete, onDuplicate }: TestCardProps) {
  const router = useRouter();
  const [isDuplicating, setIsDuplicating] = useState(false);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-CL', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
    });
  };

  // Determinar estado de la prueba
  const status = (test as any).status as string;
  const getTestStatus = () => {
    if (status === 'ACTIVE') return 'active';
    if (status === 'CLOSED') return 'closed';
    return 'draft'; // DRAFT
  };
  const testStatus = getTestStatus();

  const handleView = () => {
    // Según el estado, ir a la página correspondiente
    if (testStatus === 'closed') {
      router.push(ROUTES.TEST_RESULTS(test.id));
    } else if (testStatus === 'active') {
      router.push(ROUTES.TEST_MONITOR(test.id));
    } else {
      router.push(ROUTES.TEST_DETAIL(test.id));
    }
  };

  const handleDelete = () => {
    if (confirm(`¿Estás seguro de eliminar la prueba "${test.title}"?`)) {
      onDelete(test.id);
    }
  };

  const handleDuplicate = async () => {
    if (!onDuplicate) return;
    setIsDuplicating(true);
    try {
      await onDuplicate(test.id);
    } finally {
      setIsDuplicating(false);
    }
  };

  // Soportar tanto camelCase como snake_case del backend
  const createdAt = test.createdAt || test.created_at || '';
  const questionsCount = test.questions?.length || (test as any)._count?.questions || 0;

  // Configuración de estado visual
  const statusConfig = {
    active: {
      label: 'Activa',
      bg: 'bg-green-100',
      text: 'text-green-800',
      icon: Clock,
    },
    closed: {
      label: 'Finalizada',
      bg: 'bg-blue-100',
      text: 'text-blue-800',
      icon: CheckCircle,
    },
    draft: {
      label: 'Borrador',
      bg: 'bg-gray-100',
      text: 'text-gray-800',
      icon: Edit3,
    },
  };

  const currentStatus = statusConfig[testStatus];
  const StatusIcon = currentStatus.icon;

  return (
    <div className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow p-6 border border-gray-200">
      {/* Título */}
      <div className="mb-3">
        <h3 className="text-lg font-semibold text-gray-900 mb-1">
          {test.title}
        </h3>
        {test.course && (
          <p className="text-sm text-gray-600">{test.course.name} ({test.course.year})</p>
        )}
      </div>

      {/* Información adicional */}
      <div className="space-y-2 mb-4">
        {/* Fecha de creación */}
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Calendar className="w-4 h-4" />
          <span>{formatDate(createdAt)}</span>
        </div>

        {/* Número de preguntas */}
        {questionsCount > 0 && (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <FileText className="w-4 h-4" />
            <span>{questionsCount} preguntas</span>
          </div>
        )}
      </div>

      {/* Estado */}
      <div className="mb-4">
        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${currentStatus.bg} ${currentStatus.text}`}>
          <StatusIcon className="w-3.5 h-3.5" />
          {currentStatus.label}
        </span>
      </div>

      {/* Botones de acción */}
      <div className="flex gap-2">
        <button
          onClick={handleView}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark transition-colors text-sm font-medium"
        >
          <Eye className="w-4 h-4" />
          {testStatus === 'closed' ? 'Resultados' : testStatus === 'active' ? 'Monitor' : 'Editar'}
        </button>
        {onDuplicate && (
          <button
            onClick={handleDuplicate}
            disabled={isDuplicating}
            className="px-4 py-2 bg-blue-50 text-blue-600 rounded-md hover:bg-blue-100 transition-colors disabled:opacity-50"
            title="Duplicar prueba"
          >
            <Copy className={`w-4 h-4 ${isDuplicating ? 'animate-pulse' : ''}`} />
          </button>
        )}
        <button
          onClick={handleDelete}
          className="px-4 py-2 bg-red-50 text-red-600 rounded-md hover:bg-red-100 transition-colors"
          title="Eliminar prueba"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
