'use client';

import { useEffect, useRef, useMemo } from 'react';

interface RichMathTextProps {
  text: string;
  className?: string;
}

interface Segment {
  type: 'text' | 'math' | 'display-math';
  content: string;
}

/**
 * Parse mixed text+LaTeX into segments.
 * Handles $...$ (inline math) and $$...$$ (display math).
 * Unmatched $ are treated as literal text.
 */
function parseMathText(input: string): Segment[] {
  if (!input || !input.includes('$')) {
    return [{ type: 'text', content: input || '' }];
  }

  const segments: Segment[] = [];
  let i = 0;
  let currentText = '';

  while (i < input.length) {
    // Escaped dollar sign
    if (input[i] === '\\' && i + 1 < input.length && input[i + 1] === '$') {
      currentText += '$';
      i += 2;
      continue;
    }

    // Display math $$...$$
    if (input[i] === '$' && i + 1 < input.length && input[i + 1] === '$') {
      if (currentText) {
        segments.push({ type: 'text', content: currentText });
        currentText = '';
      }
      const end = input.indexOf('$$', i + 2);
      if (end !== -1) {
        segments.push({ type: 'display-math', content: input.slice(i + 2, end) });
        i = end + 2;
      } else {
        currentText += '$$';
        i += 2;
      }
      continue;
    }

    // Inline math $...$
    if (input[i] === '$') {
      if (currentText) {
        segments.push({ type: 'text', content: currentText });
        currentText = '';
      }
      const end = input.indexOf('$', i + 1);
      if (end !== -1) {
        segments.push({ type: 'math', content: input.slice(i + 1, end) });
        i = end + 1;
      } else {
        currentText += '$';
        i += 1;
      }
      continue;
    }

    currentText += input[i];
    i++;
  }

  if (currentText) {
    segments.push({ type: 'text', content: currentText });
  }

  return segments;
}

/**
 * Renders mixed text + LaTeX content.
 * Plain text is shown as-is, $...$ and $$...$$ segments are rendered
 * using MathLive's convertLatexToMarkup.
 */
export default function RichMathText({ text, className }: RichMathTextProps) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const segments = useMemo(() => parseMathText(text), [text]);
  const hasMath = useMemo(() => segments.some(s => s.type !== 'text'), [segments]);

  useEffect(() => {
    if (!hasMath || !containerRef.current) return;

    import('mathlive').then((MathLive) => {
      MathLive.MathfieldElement.fontsDirectory = null;

      if (!containerRef.current) return;

      const html = segments
        .map((seg) => {
          if (seg.type === 'text') {
            // Escape HTML in text segments
            const escaped = seg.content
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;');
            return `<span>${escaped}</span>`;
          }
          const markup = MathLive.convertLatexToMarkup(seg.content);
          if (seg.type === 'display-math') {
            return `<div style="text-align:center;margin:0.5em 0">${markup}</div>`;
          }
          return markup;
        })
        .join('');

      containerRef.current.innerHTML = html;
    });
  }, [segments, hasMath]);

  // No math → plain text, no MathLive needed
  if (!hasMath) {
    return <span className={className}>{text}</span>;
  }

  return <span ref={containerRef} className={className} />;
}
