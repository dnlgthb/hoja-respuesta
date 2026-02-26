'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import MathField from '@/components/MathField';

interface MathEditPopupProps {
  latex: string;
  position: { top: number; left: number };
  onConfirm: (latex: string) => void;
  onCancel: () => void;
  onDelete: () => void;
}

export default function MathEditPopup({ latex, position, onConfirm, onCancel, onDelete }: MathEditPopupProps) {
  const [value, setValue] = useState(latex);
  const popupRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        // Auto-confirm on click outside if value changed
        if (value !== latex) {
          onConfirm(value);
        } else {
          onCancel();
        }
      }
    };
    // Delay to prevent the opening click from closing immediately
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [value, latex, onConfirm, onCancel]);

  // Position adjustments to keep popup in viewport
  const adjustedPosition = useCallback(() => {
    const maxLeft = typeof window !== 'undefined' ? window.innerWidth - 320 : position.left;
    const maxTop = typeof window !== 'undefined' ? window.innerHeight - 200 : position.top;
    return {
      top: Math.min(position.top + 8, maxTop),
      left: Math.max(8, Math.min(position.left - 150, maxLeft)),
    };
  }, [position]);

  const pos = adjustedPosition();

  return (
    <div
      ref={popupRef}
      className="math-edit-popup"
      style={{ top: pos.top, left: pos.left }}
    >
      <div className="popup-header">
        <span>Editar fórmula</span>
      </div>
      <MathField
        value={value}
        onChange={setValue}
        placeholder="Escribe la fórmula..."
        compact
      />
      <div className="popup-actions">
        <button
          type="button"
          onClick={onDelete}
          className="px-2 py-1 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
        >
          Eliminar
        </button>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1 text-xs text-gray-500 hover:bg-gray-100 rounded transition-colors"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => onConfirm(value)}
          className="px-3 py-1 text-xs bg-teal-500 text-white rounded hover:bg-teal-600 transition-colors"
        >
          OK
        </button>
      </div>
    </div>
  );
}
