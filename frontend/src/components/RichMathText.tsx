'use client';

import { useEffect, useRef, useState, useMemo } from 'react';

interface RichMathTextProps {
  text: string;
  className?: string;
}

interface Segment {
  type: 'text' | 'math' | 'display-math';
  content: string;
}

// Common LaTeX commands that indicate math content without $ delimiters
const BARE_LATEX_PATTERN = /\\(frac|sqrt|cdot|times|div|pm|mp|neq|geq|leq|sim|approx|infty|pi|alpha|beta|gamma|delta|theta|lambda|sigma|vec|overline|underline|hat|bar|dot|sum|prod|int|lim|log|ln|sin|cos|tan|sec|csc|cot|text|mathrm|mathbf|left|right|begin|end)\b/;

/**
 * Pre-process text to wrap bare LaTeX commands in $ delimiters.
 * Detects patterns like "\frac{1}{2}" or "3 \cdot 5" without $ wrappers.
 */
function preprocessLatex(input: string): string {
  if (!input) return input;

  // If already has $ delimiters, return as-is (the parser will handle them)
  if (input.includes('$')) return input;

  // Also handle \(...\) and \[...\] delimiters (convert to $...$ and $$...$$)
  let processed = input.replace(/\\\((.*?)\\\)/g, (_, math) => `$${math}$`);
  processed = processed.replace(/\\\[(.*?)\\\]/g, (_, math) => `$$${math}$$`);
  if (processed !== input) return processed;

  // Check for bare LaTeX commands
  if (!BARE_LATEX_PATTERN.test(input)) return input;

  // Wrap segments containing LaTeX commands in $ delimiters
  // Strategy: find runs of text that contain LaTeX commands and wrap them
  return input.replace(
    // Match sequences that start with a LaTeX command or contain LaTeX within a mathematical context
    /(?:(?:^|(?<=\s|,|:|;|\()))((?:[^$\s]*\\(?:frac|sqrt|cdot|times|div|pm|mp|neq|geq|leq|sim|approx|infty|pi|alpha|beta|gamma|delta|theta|lambda|sigma|vec|overline|underline|hat|bar|dot|sum|prod|int|lim|log|ln|sin|cos|tan|text|mathrm|mathbf|left|right)[^$\s]*)+)/g,
    (match) => `$${match}$`
  );
}

/**
 * Parse mixed text+LaTeX into segments.
 * Handles $...$ (inline math) and $$...$$ (display math).
 * Also handles \(...\) and \[...\] delimiters.
 * Detects bare LaTeX commands without delimiters.
 * Unmatched $ are treated as literal text.
 */
function parseMathText(input: string): Segment[] {
  const processed = preprocessLatex(input);

  if (!processed || !processed.includes('$')) {
    return [{ type: 'text', content: input || '' }];
  }

  const segments: Segment[] = [];
  let i = 0;
  let currentText = '';

  while (i < processed.length) {
    // Escaped dollar sign
    if (processed[i] === '\\' && i + 1 < processed.length && processed[i + 1] === '$') {
      currentText += '$';
      i += 2;
      continue;
    }

    // Display math $$...$$
    if (processed[i] === '$' && i + 1 < processed.length && processed[i + 1] === '$') {
      if (currentText) {
        segments.push({ type: 'text', content: currentText });
        currentText = '';
      }
      const end = processed.indexOf('$$', i + 2);
      if (end !== -1) {
        segments.push({ type: 'display-math', content: processed.slice(i + 2, end) });
        i = end + 2;
      } else {
        currentText += '$$';
        i += 2;
      }
      continue;
    }

    // Inline math $...$
    if (processed[i] === '$') {
      if (currentText) {
        segments.push({ type: 'text', content: currentText });
        currentText = '';
      }
      const end = processed.indexOf('$', i + 1);
      if (end !== -1) {
        segments.push({ type: 'math', content: processed.slice(i + 1, end) });
        i = end + 1;
      } else {
        currentText += '$';
        i += 1;
      }
      continue;
    }

    currentText += processed[i];
    i++;
  }

  if (currentText) {
    segments.push({ type: 'text', content: currentText });
  }

  return segments;
}

/**
 * Create a plain-text fallback by stripping $ delimiters.
 * Used when MathLive fails to load.
 */
function stripDollarSigns(text: string): string {
  return text
    .replace(/\$\$/g, '')
    .replace(/\$/g, '')
    .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '($1/$2)')
    .replace(/\\sqrt\{([^}]*)\}/g, 'sqrt($1)')
    .replace(/\\cdot/g, '\u00B7')
    .replace(/\\times/g, '\u00D7')
    .replace(/\\div/g, '\u00F7')
    .replace(/\\pm/g, '\u00B1')
    .replace(/\\neq/g, '\u2260')
    .replace(/\\geq/g, '\u2265')
    .replace(/\\leq/g, '\u2264')
    .replace(/\\pi/g, '\u03C0')
    .replace(/\\infty/g, '\u221E')
    .replace(/\\sim/g, '~')
    .replace(/\\approx/g, '\u2248')
    .replace(/\^{([^}]*)}/g, '^$1')
    .replace(/_{([^}]*)}/g, '_$1')
    .replace(/\\left/g, '')
    .replace(/\\right/g, '')
    .replace(/\\text\{([^}]*)\}/g, '$1')
    .replace(/\\mathrm\{([^}]*)\}/g, '$1')
    .replace(/\\\\/g, ' ');
}

/**
 * Renders mixed text + LaTeX content.
 * Plain text is shown as-is, $...$ and $$...$$ segments are rendered
 * using MathLive's convertLatexToMarkup.
 * Falls back to unicode-cleaned text if MathLive fails.
 */
export default function RichMathText({ text, className }: RichMathTextProps) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const segments = useMemo(() => parseMathText(text), [text]);
  const hasMath = useMemo(() => segments.some(s => s.type !== 'text'), [segments]);
  const [mathLoaded, setMathLoaded] = useState(false);
  const [mathFailed, setMathFailed] = useState(false);

  useEffect(() => {
    if (!hasMath || !containerRef.current) return;

    import('mathlive')
      .then((MathLive) => {
        MathLive.MathfieldElement.fontsDirectory = null;

        if (!containerRef.current) return;

        const html = segments
          .map((seg) => {
            if (seg.type === 'text') {
              const escaped = seg.content
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
              return `<span>${escaped}</span>`;
            }
            try {
              const markup = MathLive.convertLatexToMarkup(seg.content);
              if (seg.type === 'display-math') {
                return `<div style="text-align:center;margin:0.5em 0">${markup}</div>`;
              }
              return markup;
            } catch {
              // If a specific expression fails, show it as text
              return `<span>${seg.content}</span>`;
            }
          })
          .join('');

        containerRef.current.innerHTML = html;
        setMathLoaded(true);
      })
      .catch(() => {
        setMathFailed(true);
      });
  }, [segments, hasMath]);

  // No math → plain text, no MathLive needed
  if (!hasMath) {
    return <span className={className}>{text}</span>;
  }

  // MathLive failed → show fallback with unicode replacements
  if (mathFailed) {
    return <span className={className}>{stripDollarSigns(text)}</span>;
  }

  // Show fallback text until MathLive loads (prevents empty flash)
  return (
    <span ref={containerRef} className={className}>
      {!mathLoaded && stripDollarSigns(text)}
    </span>
  );
}
