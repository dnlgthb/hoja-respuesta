'use client';

import { useEffect, useRef, useState } from 'react';
import type { MathfieldElement } from 'mathlive';
import { MATH_TOOLBAR_BUTTONS } from '@/components/MathToolbar';

interface MathFieldProps {
  value: string;
  onChange: (latex: string) => void;
  placeholder?: string;
  disabled?: boolean;
  compact?: boolean;
}

export default function MathField({ value, onChange, placeholder, disabled, compact }: MathFieldProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mathfieldRef = useRef<MathfieldElement | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [showToolbar, setShowToolbar] = useState(false);

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
      mathfield.style.minHeight = compact ? '38px' : '60px';
      mathfield.style.padding = compact ? '6px 10px' : '12px';
      mathfield.style.fontSize = compact ? '16px' : '18px';
      mathfield.style.border = `2px solid ${compact ? '#D1D5DB' : '#14B8A6'}`;
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

      // Arrow up/down: move cursor by visual line instead of math navigation
      mathfield.addEventListener('keydown', (e: Event) => {
        const ke = e as KeyboardEvent;
        if (ke.key === 'ArrowUp' || ke.key === 'ArrowDown') {
          try {
            const mf = mathfield as any;
            const caret = mf.caretPoint;
            if (caret) {
              const fontSize = parseFloat(getComputedStyle(mathfield).fontSize) || 18;
              const lineHeight = fontSize * 1.5;
              const dy = ke.key === 'ArrowUp' ? -lineHeight : lineHeight;
              mf.setCaretPoint(caret.x, caret.y + dy);
              ke.preventDefault();
              ke.stopPropagation();
            }
          } catch { /* fallback to default behavior */ }
        }
      });

      containerRef.current.appendChild(mathfield);
      mathfieldRef.current = mathfield;

      // Inject line-wrapping CSS + remove blue \text{} highlight into shadow DOM
      requestAnimationFrame(() => {
        if (mathfield.shadowRoot) {
          const wrapStyle = document.createElement('style');
          wrapStyle.textContent = `
            .ML__content { overflow: visible !important; }
            .ML__fieldcontainer { overflow: visible !important; }
            .ML__latex { white-space: normal !important; flex: 1 1 100% !important; min-width: 0 !important; }
            .ML__base { white-space: normal !important; width: 100% !important; }
            .ML__text { white-space: normal !important; background: transparent !important; background-color: transparent !important; }
          `;
          mathfield.shadowRoot.appendChild(wrapStyle);
        }
      });
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
      const mf = mathfieldRef.current;
      // When content has \text{} blocks, cursor may be in text mode.
      // Directly manipulate the value to append math at the end.
      const currentValue = mf.value;
      const cleanLatex = latex.replace(/#0/g, '\\placeholder{}');
      const newValue = currentValue + cleanLatex;
      mf.value = newValue;
      onChange(mf.value);
      mf.focus();
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
      {!compact && placeholder && !value && (
        <p className="text-sm text-gray-500 mb-2">{placeholder}</p>
      )}

      {/* Barra de herramientas (colapsable) */}
      <div className={`flex items-center ${compact ? 'p-1.5' : 'p-1.5 px-2'} bg-gray-50 border border-gray-200 rounded-t-lg border-b-0 gap-1`}>
        <button
          type="button"
          onClick={() => setShowToolbar(prev => !prev)}
          className={`px-2 py-1 text-xs font-medium rounded border transition-colors flex-shrink-0 ${
            showToolbar
              ? 'bg-teal-50 text-teal-700 border-teal-200 hover:bg-teal-100'
              : 'bg-white text-gray-500 border-gray-300 hover:bg-gray-100'
          }`}
          title={showToolbar ? 'Ocultar símbolos' : 'Mostrar símbolos matemáticos'}
        >
          𝑓x
        </button>
        {showToolbar && (
          <div className="flex flex-wrap gap-1">
            {toolbarButtons.map((btn, i) => (
              <button
                key={i}
                type="button"
                title={btn.title}
                disabled={disabled}
                className={`${compact ? 'px-1.5 py-0.5 text-xs min-w-[26px]' : 'px-2 py-1 text-sm min-w-[32px]'} bg-white border border-gray-300 rounded hover:bg-teal-500 hover:text-white hover:border-teal-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:text-current disabled:hover:border-gray-300`}
                onClick={() => insertSymbol(btn.latex)}
              >
                {btn.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Contenedor para math-field */}
      <div ref={containerRef} />

      {!compact && (
        <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
          <span>💡</span>
          Usa la barra de herramientas o escribe directamente.
        </p>
      )}
    </div>
  );
}
