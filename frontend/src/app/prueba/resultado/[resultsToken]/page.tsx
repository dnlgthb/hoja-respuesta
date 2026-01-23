'use client';

import { useParams } from 'next/navigation';
import { FileText, Clock } from 'lucide-react';

export default function ResultadosPage() {
  const params = useParams();
  const resultsToken = params.resultsToken as string;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="text-center max-w-md">
        <div className="inline-flex items-center justify-center w-20 h-20 bg-primary/10 rounded-full mb-6">
          <FileText className="w-10 h-10 text-primary" />
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-3">
          Prueba Entregada
        </h1>

        <p className="text-gray-600 mb-6">
          Tu prueba ha sido entregada exitosamente. Los resultados estarán disponibles pronto.
        </p>

        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
          <div className="flex items-center justify-center gap-2 text-gray-500">
            <Clock className="w-5 h-5" />
            <span>Resultados - Próximamente</span>
          </div>
        </div>

        <p className="text-sm text-gray-400">
          Token: {resultsToken.slice(0, 8)}...
        </p>
      </div>
    </div>
  );
}
