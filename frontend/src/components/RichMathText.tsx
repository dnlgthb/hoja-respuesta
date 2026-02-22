'use client';

import { useEffect, useState, useMemo } from 'react';

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
 */
function preprocessLatex(input: string): string {
  if (!input) return input;

  // If already has $ delimiters, return as-is
  if (input.includes('$')) return input;

  // Handle \(...\) and \[...\] delimiters
  let processed = input.replace(/\\\((.*?)\\\)/g, (_, math) => `$${math}$`);
  processed = processed.replace(/\\\[(.*?)\\\]/g, (_, math) => `$$${math}$$`);
  if (processed !== input) return processed;

  // Check for bare LaTeX commands - if found, wrap the whole thing
  if (BARE_LATEX_PATTERN.test(input)) {
    // Simple approach: wrap entire text in $ if it contains LaTeX commands
    // This works because if there are no $, the whole text is likely a math expression
    return `$${input}$`;
  }

  return input;
}

/**
 * Parse mixed text+LaTeX into segments.
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
    if (processed[i] === '\\' && i + 1 < processed.length && processed[i + 1] === '$') {
      currentText += '$';
      i += 2;
      continue;
    }

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
 * Create a plain-text fallback by stripping $ and replacing LaTeX with unicode.
 */
function stripDollarSigns(text: string): string {
  return text
    .replace(/\$\$/g, '')
    .replace(/\$/g, '')
    .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '($1/$2)')
    .replace(/\\sqrt\{([^}]*)\}/g, '\u221A($1)')
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

// Cache MathLive module to avoid re-importing on every component mount
let mathLivePromise: Promise<any> | null = null;
function getMathLive() {
  if (!mathLivePromise) {
    mathLivePromise = import('mathlive').then((mod) => {
      mod.MathfieldElement.fontsDirectory = null;
      console.log('[RichMathText] MathLive loaded successfully');
      return mod;
    }).catch((err) => {
      console.error('[RichMathText] Failed to load MathLive:', err);
      mathLivePromise = null; // Allow retry
      throw err;
    });
  }
  return mathLivePromise;
}

/**
 * Renders mixed text + LaTeX content.
 * Uses state-based rendering (no ref.innerHTML) to avoid React reconciliation issues.
 */
export default function RichMathText({ text, className }: RichMathTextProps) {
  const segments = useMemo(() => parseMathText(text), [text]);
  const hasMath = useMemo(() => segments.some(s => s.type !== 'text'), [segments]);
  const [renderedHtml, setRenderedHtml] = useState<string | null>(null);

  useEffect(() => {
    if (!hasMath) return;

    let cancelled = false;

    getMathLive()
      .then((MathLive) => {
        if (cancelled) return;

        const html = segments
          .map((seg) => {
            if (seg.type === 'text') {
              const escaped = seg.content
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
              return escaped;
            }
            try {
              const markup = MathLive.convertLatexToMarkup(seg.content);
              if (seg.type === 'display-math') {
                return `<div style="text-align:center;margin:0.5em 0">${markup}</div>`;
              }
              return markup;
            } catch (err) {
              console.warn('[RichMathText] Failed to render:', seg.content, err);
              return seg.content;
            }
          })
          .join('');

        setRenderedHtml(html);
      })
      .catch(() => {
        // MathLive failed — renderedHtml stays null, fallback shown
      });

    return () => { cancelled = true; };
  }, [segments, hasMath]);

  // No math detected → plain text
  if (!hasMath) {
    return <span className={className}>{text}</span>;
  }

  // MathLive rendered successfully → use dangerouslySetInnerHTML (no React conflicts)
  if (renderedHtml !== null) {
    return <span className={className} dangerouslySetInnerHTML={{ __html: renderedHtml }} />;
  }

  // Fallback while loading or if MathLive failed
  return <span className={className}>{stripDollarSigns(text)}</span>;
}
