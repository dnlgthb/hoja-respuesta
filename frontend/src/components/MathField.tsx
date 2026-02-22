'use client';

import { useEffect, useRef, useState } from 'react';
import type { MathfieldElement } from 'mathlive';
import { MATH_TOOLBAR_BUTTONS } from '@/components/MathToolbar';

interface MathFieldProps {
  value: string;
  onChange: (latex: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export default function MathField({ value, onChange, placeholder, disabled }: MathFieldProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mathfieldRef = useRef<MathfieldElement | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // Importar MathLive dinámicamente (solo cliente)
    import('mathlive').then((MathLive) => {
      // Configurar fonts desde CDN - usar null para que use fonts del sistema
      MathLive.MathfieldElement.fontsDirectory = null;
      setIsLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!isLoaded || !containerRef.current) return;

    // Crear el mathfield si no existe
    if (!mathfieldRef.current) {
      const mathfield = document.createElement('math-field') as MathfieldElement;

      // Estilos
      mathfield.style.display = 'block';
      mathfield.style.width = '100%';
      mathfield.style.minHeight = '60px';
      mathfield.style.padding = '12px';
      mathfield.style.fontSize = '18px';
      mathfield.style.border = '2px solid #14B8A6';
      mathfield.style.borderRadius = '0 0 8px 8px';
      mathfield.style.backgroundColor = disabled ? '#F3F4F6' : '#FFFFFF';

      // Atributos
      mathfield.setAttribute('virtual-keyboard-mode', 'manual');
      // NO usar placeholder de MathLive - tiene problemas con espacios
      if (disabled) {
        mathfield.setAttribute('read-only', 'true');
      }

      // Valor inicial
      mathfield.value = value || '';

      // Evento de cambio
      mathfield.addEventListener('input', () => {
        onChange(mathfield.value);
      });

      containerRef.current.appendChild(mathfield);
      mathfieldRef.current = mathfield;
    }
  }, [isLoaded]);

  // Sincronizar valor externo
  useEffect(() => {
    if (mathfieldRef.current && mathfieldRef.current.value !== value) {
      mathfieldRef.current.value = value || '';
    }
  }, [value]);

  // Sincronizar disabled
  useEffect(() => {
    if (mathfieldRef.current) {
      mathfieldRef.current.style.backgroundColor = disabled ? '#F3F4F6' : '#FFFFFF';
      if (disabled) {
        mathfieldRef.current.setAttribute('read-only', 'true');
      } else {
        mathfieldRef.current.removeAttribute('read-only');
      }
    }
  }, [disabled]);

  const insertSymbol = (latex: string) => {
    if (mathfieldRef.current) {
      mathfieldRef.current.insert(latex, { focus: true });
    }
  };

  const toolbarButtons = MATH_TOOLBAR_BUTTONS;

  if (!isLoaded) {
    return (
      <div className="animate-pulse bg-gray-200 rounded-lg h-24">
        <span className="sr-only">Cargando editor matemático...</span>
      </div>
    );
  }

  return (
    <div className="mathfield-container">
      {/* Instrucción visible */}
      {placeholder && !value && (
        <p className="text-sm text-gray-500 mb-2">{placeholder}</p>
      )}

      {/* Barra de herramientas */}
      <div className="flex flex-wrap gap-1 p-2 bg-gray-50 border border-gray-200 rounded-t-lg border-b-0">
        {toolbarButtons.map((btn, i) => (
          <button
            key={i}
            type="button"
            title={btn.title}
            disabled={disabled}
            className="px-2 py-1 bg-white border border-gray-300 rounded text-sm hover:bg-teal-500 hover:text-white hover:border-teal-500 transition-colors min-w-[32px] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:text-current disabled:hover:border-gray-300"
            onClick={() => insertSymbol(btn.latex)}
          >
            {btn.label}
          </button>
        ))}
      </div>

      {/* Contenedor para math-field */}
      <div ref={containerRef} />

      <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
        <span>💡</span>
        Usa la barra de herramientas o escribe directamente.
      </p>
    </div>
  );
}
