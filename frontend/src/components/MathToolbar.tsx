'use client';

export interface MathToolbarButton {
  label: string;
  latex: string;
  title: string;
}

export const MATH_TOOLBAR_BUTTONS: MathToolbarButton[] = [
  { label: 'a/b', latex: '\\frac{#0}{#0}', title: 'Fracción' },
  { label: '\u221A', latex: '\\sqrt{#0}', title: 'Raíz cuadrada' },
  { label: 'x\u207F', latex: '^{#0}', title: 'Exponente' },
  { label: 'x\u2081', latex: '_{#0}', title: 'Subíndice' },
  { label: '\u03C0', latex: '\\pi', title: 'Pi' },
  { label: '\u00B1', latex: '\\pm', title: 'Más menos' },
  { label: '\u221E', latex: '\\infty', title: 'Infinito' },
  { label: '\u2260', latex: '\\neq', title: 'Diferente' },
  { label: '\u2264', latex: '\\leq', title: 'Menor o igual' },
  { label: '\u2265', latex: '\\geq', title: 'Mayor o igual' },
  { label: '\u00D7', latex: '\\times', title: 'Multiplicación' },
  { label: '\u00B7', latex: '\\cdot', title: 'Punto medio' },
];

interface MathToolbarProps {
  onInsert: (latex: string) => void;
  disabled?: boolean;
  className?: string;
}

export default function MathToolbar({ onInsert, disabled, className }: MathToolbarProps) {
  return (
    <div className={`flex flex-wrap gap-1 p-2 bg-gray-50 border border-gray-200 rounded-lg ${className || ''}`}>
      {MATH_TOOLBAR_BUTTONS.map((btn, i) => (
        <button
          key={i}
          type="button"
          title={btn.title}
          disabled={disabled}
          className="px-2 py-1 bg-white border border-gray-300 rounded text-sm hover:bg-teal-500 hover:text-white hover:border-teal-500 transition-colors min-w-[32px] disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={(e) => {
            e.preventDefault();
            onInsert(btn.latex);
          }}
        >
          {btn.label}
        </button>
      ))}
    </div>
  );
}
