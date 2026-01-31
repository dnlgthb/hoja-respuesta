'use client';

import { useEffect, useRef } from 'react';

interface MathDisplayProps {
  latex: string;
}

export default function MathDisplay({ latex }: MathDisplayProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    import('mathlive').then((MathLive) => {
      // Usar fonts del sistema
      MathLive.MathfieldElement.fontsDirectory = null;

      if (containerRef.current && latex) {
        containerRef.current.innerHTML = MathLive.convertLatexToMarkup(latex);
      }
    });
  }, [latex]);

  return (
    <span
      ref={containerRef}
      className="math-display inline-block"
      style={{ fontSize: '16px' }}
    />
  );
}
