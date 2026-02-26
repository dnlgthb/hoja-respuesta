'use client';

import { useEffect, useState, useMemo } from 'react';
import 'mathlive/static.css';

interface RichMathTextProps {
  text: string;
  className?: string;
}

interface Segment {
  type: 'text' | 'math' | 'display-math';
  content: string;
}

// Common LaTeX commands that indicate math content without $ delimiters
const BARE_LATEX_PATTERN = /\\(frac|sqrt|cdot|times|div|pm|mp|neq|geq|leq|sim|approx|infty|pi|alpha|beta|gamma|delta|theta|lambda|sigma|vec|overline|underline|hat|bar|dot|sum|prod|int|lim|log|ln|sin|cos|tan|sec|csc|cot|text|mathrm|mathbf|textbf|left|right)\b/;

// LaTeX table environments that should NOT trigger math wrapping
const TABULAR_ENV_PATTERN = /\\begin\{(tabular|tabularx|array|longtable|table)\}/;

/**
 * Convert LaTeX tabular environments to readable plain text.
 * Strips \begin{tabular}, \end{tabular}, \hline, \multicolumn, etc.
 * Converts & (column separator) to " | " and \\ (row separator) to newlines.
 */
function convertTabularToText(text: string): string {
  if (!TABULAR_ENV_PATTERN.test(text)) return text;

  return text
    // Remove \begin{tabular}{...} and \end{tabular} (with any column spec)
    .replace(/\\begin\{(?:tabular|tabularx|array|longtable|table)\}(?:\{[^}]*\})?/g, '')
    .replace(/\\end\{(?:tabular|tabularx|array|longtable|table)\}/g, '')
    // Remove \hline, \cline{...}
    .replace(/\\hline/g, '')
    .replace(/\\cline\s*\{[^}]*\}/g, '')
    // Convert \multicolumn{n}{spec}{text} → text
    .replace(/\\multicolumn\{[^}]*\}\{[^}]*\}\{([^}]*)\}/g, '$1')
    // Remove \section*{} and similar structural commands
    .replace(/\\section\*?\{([^}]*)\}/g, '$1')
    // Convert \\ (row ends) to newlines
    .replace(/\\\\/g, '\n')
    // Convert & (column separators) to " | "
    .replace(/\s*&\s*/g, ' | ')
    // Clean up multiple blank lines
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Repair LaTeX commands destroyed by JSON.parse escape interpretation.
 * When AI returns \frac in JSON, \f becomes form-feed (0x0C), \t becomes tab (0x09), etc.
 * This repairs the mangled text so MathLive can render it.
 */
function repairBrokenLatex(text: string): string {
  if (!text) return text;

  // Quick check: if no control chars, nothing to repair
  // eslint-disable-next-line no-control-regex
  if (!/[\x08\x09\x0A\x0C\x0D]/.test(text)) return text;

  let result = text;

  // \f (0x0C form-feed) → \frac, \forall
  result = result.replace(/\x0Crac(?=[{\s(]|$)/g, '\\frac');
  result = result.replace(/\x0Corall\b/g, '\\forall');

  // \t (0x09 tab) → \times, \text, \textbf, \theta, \tau, \to, \triangle, \tan
  result = result.replace(/\x09extbf\b/g, '\\textbf');
  result = result.replace(/\x09imes\b/g, '\\times');
  result = result.replace(/\x09ext(?=[{\s\\]|$)/g, '\\text');
  result = result.replace(/\x09heta\b/g, '\\theta');
  result = result.replace(/\x09au\b/g, '\\tau');
  result = result.replace(/\x09riangle\b/g, '\\triangle');
  result = result.replace(/\x09an(?=[{\s(]|$)/g, '\\tan');
  result = result.replace(/\x09o\b/g, '\\to');

  // \n (0x0A newline) → \neq, \nu, \neg, \nabla, \notin
  result = result.replace(/\x0Aeq\b/g, '\\neq');
  result = result.replace(/\x0Au\b/g, '\\nu');
  result = result.replace(/\x0Aeg\b/g, '\\neg');
  result = result.replace(/\x0Aabla\b/g, '\\nabla');
  result = result.replace(/\x0Aotin\b/g, '\\notin');

  // \r (0x0D carriage return) → \right, \rho
  result = result.replace(/\x0Dight\b/g, '\\right');
  result = result.replace(/\x0Dho\b/g, '\\rho');

  // \b (0x08 backspace) → \bar, \beta, \begin, \binom
  result = result.replace(/\x08ar(?=[{\s(]|$)/g, '\\bar');
  result = result.replace(/\x08eta\b/g, '\\beta');
  result = result.replace(/\x08egin\b/g, '\\begin');
  result = result.replace(/\x08inom\b/g, '\\binom');

  return result;
}

/**
 * Pre-process text to wrap bare LaTeX commands in $ delimiters.
 */
function preprocessLatex(input: string): string {
  if (!input) return input;

  // Step -1: Fix literal \n (two chars) → actual newlines (fixLatexInJsonString bug)
  input = input.replace(/\\n(?![a-zA-Z])/g, '\n');

  // Step -0.5: Fix \textdollar → $ (Phase 2 sometimes outputs this for dollar signs)
  input = input.replace(/\\text\{\\textdollar\}/g, '\\$');
  input = input.replace(/\\textdollar/g, '\\$');

  // Step 0: Repair control characters from JSON.parse escape destruction
  input = repairBrokenLatex(input);

  // Step 0.5: Fix double-escaped percent signs (\\% → \%)
  // AI sometimes produces \\% in JSON which after parsing becomes \\% instead of \%
  input = input.replace(/\\\\%/g, '\\%');

  // Step 0.7: Convert LaTeX tabular environments to readable text
  // Must be done before $ detection since tabular uses & which isn't math
  input = convertTabularToText(input);

  // Step 0.8: Remove \section*{title} → title (structural LaTeX from Mathpix)
  input = input.replace(/\\(?:sub)*section\*?\{([^}]*)\}/g, '$1');

  // Step 0.9: Fix currency $\n$ NUMBER$ → $NUMBER (Chilean peso pattern)
  // Phase 2 breaks "$300.000" into "$\n$ 300000$" where \n is a real newline
  input = input.replace(/\$\s*\n\s*\$\s*(\d[\d.,\s]*)\$/g, (_, num) => '\\$' + num.trim());

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
 * Find next unescaped $ (skipping \$ sequences).
 */
function findUnescapedDollar(text: string, start: number): number {
  let i = start;
  while (i < text.length) {
    if (text[i] === '\\' && i + 1 < text.length && text[i + 1] === '$') {
      i += 2; // Skip \$
      continue;
    }
    if (text[i] === '$') return i;
    i++;
  }
  return -1;
}

/**
 * Find next unescaped $$ (skipping \$ sequences).
 */
function findUnescapedDoubleDollar(text: string, start: number): number {
  let i = start;
  while (i < text.length) {
    if (text[i] === '\\' && i + 1 < text.length && text[i + 1] === '$') {
      i += 2; // Skip \$
      continue;
    }
    if (text[i] === '$' && i + 1 < text.length && text[i + 1] === '$') return i;
    i++;
  }
  return -1;
}

/**
 * Parse mixed text+LaTeX into segments.
 */
function parseMathText(input: string): Segment[] {
  const processed = preprocessLatex(input);

  if (!processed || !processed.includes('$')) {
    return [{ type: 'text', content: processed || '' }];
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
      const end = findUnescapedDoubleDollar(processed, i + 2);
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
      const end = findUnescapedDollar(processed, i + 1);
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
let mathLiveLoaded = false;
function getMathLive() {
  if (!mathLivePromise) {
    mathLivePromise = import('mathlive').then((mod) => {
      mod.MathfieldElement.fontsDirectory = null;
      mathLiveLoaded = true;
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
  const hasImages = useMemo(() => /!\[[^\]]*\]\([^)]+\)/.test(text), [text]);
  const needsHtmlRender = hasMath || hasImages;
  const [renderedHtml, setRenderedHtml] = useState<string | null>(null);


  useEffect(() => {
    if (!needsHtmlRender) return;

    let cancelled = false;

    const buildHtml = async () => {
      const MathLive = hasMath ? await getMathLive() : null;
      if (cancelled) return;

      const html = segments
        .map((seg) => {
          if (seg.type === 'text') {
            let escaped = seg.content
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/\n/g, '<br/>');
            // Convert markdown images ![alt](url) to <img> tags
            escaped = escaped.replace(
              /!\[([^\]]*)\]\(([^)]+)\)/g,
              '<img src="$2" alt="$1" style="max-width:100%;margin:0.5em 0;display:block;border-radius:4px;" />'
            );
            return escaped;
          }
          if (MathLive) {
            try {
              const markup = MathLive.convertLatexToMarkup(seg.content);
              if (seg.type === 'display-math') {
                return `<div style="text-align:center;margin:0.5em 0">${markup}</div>`;
              }
              return markup;
            } catch (err) {
              console.error(`[RichMathText] Failed to render: "${seg.content}"`, err);
              return seg.content;
            }
          }
          return seg.content;
        })
        .join('');

      if (!cancelled) {
        setRenderedHtml(html);
      }
    };

    buildHtml().catch((err) => {
      console.error('[RichMathText] MathLive load/render error:', err);
    });

    return () => { cancelled = true; };
  }, [segments, needsHtmlRender, hasMath]);

  // No rich content → plain text (use processed segments to handle \$ → $ conversion)
  if (!needsHtmlRender) {
    const plainText = segments.map(s => s.content).join('');
    return <span className={className}>{plainText}</span>;
  }

  // MathLive rendered successfully → use dangerouslySetInnerHTML (no React conflicts)
  if (renderedHtml !== null) {
    return <span className={className} dangerouslySetInnerHTML={{ __html: renderedHtml }} />;
  }

  // Fallback while loading or if MathLive failed
  return <span className={className}>{stripDollarSigns(text)}</span>;
}
