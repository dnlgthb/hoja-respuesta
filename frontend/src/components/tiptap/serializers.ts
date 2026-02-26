/**
 * Bidirectional serializer: plain text with $...$ math and ![](url) images <-> TipTap HTML/JSON.
 *
 * Plain text format (stored in DB):
 *   - Inline math: $latex$
 *   - Display math: $$latex$$
 *   - Escaped dollar: \$
 *   - Images: ![alt](url)
 *   - Paragraphs: separated by \n\n
 *   - Line breaks: \n
 *
 * TipTap node types:
 *   - inlineMath: <span data-type="inline-math" data-latex="...">
 *   - blockMath: <div data-type="block-math" data-latex="...">
 *   - image: <img src="..." alt="...">
 *   - paragraph: <p>
 *   - hardBreak: <br>
 */

import type { JSONContent } from '@tiptap/react';

const DOLLAR_PLACEHOLDER = '\uFFFE';

/** Escape text for use in HTML content */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Escape text for use in HTML attributes (double-quoted) */
function escapeAttr(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Find the next unescaped $ character (skipping \$ sequences).
 */
function findUnescapedDollar(text: string, start: number): number {
  let i = start;
  while (i < text.length) {
    if (text[i] === '\\' && i + 1 < text.length && text[i + 1] === '$') {
      i += 2;
      continue;
    }
    if (text[i] === '$') return i;
    i++;
  }
  return -1;
}

/**
 * Parse a line of text into segments of text, inline-math, display-math, and images.
 */
type Segment =
  | { type: 'text'; content: string }
  | { type: 'inline-math'; latex: string }
  | { type: 'display-math'; latex: string }
  | { type: 'image'; src: string; alt: string };

function parseLineSegments(line: string): Segment[] {
  const segments: Segment[] = [];
  let i = 0;
  let currentText = '';

  const flushText = () => {
    if (currentText) {
      segments.push({ type: 'text', content: currentText });
      currentText = '';
    }
  };

  while (i < line.length) {
    // Handle escaped dollar: \$
    if (line[i] === '\\' && i + 1 < line.length && line[i + 1] === '$') {
      currentText += DOLLAR_PLACEHOLDER;
      i += 2;
      continue;
    }

    // Handle markdown image: ![alt](url)
    if (line[i] === '!' && line[i + 1] === '[') {
      const closeBracket = line.indexOf(']', i + 2);
      if (closeBracket !== -1 && line[closeBracket + 1] === '(') {
        const closeParen = line.indexOf(')', closeBracket + 2);
        if (closeParen !== -1) {
          flushText();
          const alt = line.slice(i + 2, closeBracket);
          const src = line.slice(closeBracket + 2, closeParen);
          segments.push({ type: 'image', src, alt });
          i = closeParen + 1;
          continue;
        }
      }
    }

    // Handle display math: $$...$$
    if (line[i] === '$' && line[i + 1] === '$') {
      // Find closing $$
      let end = -1;
      let j = i + 2;
      while (j < line.length - 1) {
        if (line[j] === '\\' && line[j + 1] === '$') {
          j += 2;
          continue;
        }
        if (line[j] === '$' && line[j + 1] === '$') {
          end = j;
          break;
        }
        j++;
      }
      if (end !== -1) {
        flushText();
        segments.push({ type: 'display-math', latex: line.slice(i + 2, end) });
        i = end + 2;
        continue;
      }
    }

    // Handle inline math: $...$
    if (line[i] === '$') {
      const end = findUnescapedDollar(line, i + 1);
      if (end !== -1 && end > i + 1) {
        flushText();
        segments.push({ type: 'inline-math', latex: line.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }

    currentText += line[i];
    i++;
  }

  flushText();
  return segments;
}

/**
 * Convert a paragraph's inline segments to HTML.
 */
function segmentsToHtml(segments: Segment[]): string {
  return segments.map(seg => {
    switch (seg.type) {
      case 'text':
        return escapeHtml(seg.content).replace(new RegExp(DOLLAR_PLACEHOLDER, 'g'), '$');
      case 'inline-math':
        return `<span data-type="inline-math" data-latex="${escapeAttr(seg.latex)}"></span>`;
      case 'display-math':
        return `</p><div data-type="block-math" data-latex="${escapeAttr(seg.latex)}"></div><p>`;
      case 'image':
        return `</p><img src="${escapeAttr(seg.src)}" alt="${escapeAttr(seg.alt)}"><p>`;
      default:
        return '';
    }
  }).join('');
}

/**
 * Convert plain text (with $math$, $$display$$, ![img](url), \$) to TipTap HTML.
 */
export function plainTextToTipTapHtml(text: string): string {
  if (!text) return '<p></p>';

  // Normalize: ensure images on own lines have \n\n separation
  text = normalizeForTipTap(text);

  // Split into paragraphs on double newlines
  const paragraphs = text.split(/\n\n/);

  const htmlParts = paragraphs.map(para => {
    // Split paragraph on single newlines to handle <br>
    const lines = para.split('\n');
    const lineHtmls = lines.map(line => {
      const segments = parseLineSegments(line);
      return segmentsToHtml(segments);
    });
    // Join lines with <br> within a paragraph
    const innerHtml = lineHtmls.join('<br>');
    return `<p>${innerHtml}</p>`;
  });

  let html = htmlParts.join('');
  // Clean up empty paragraphs created by block elements
  html = html.replace(/<p><\/p>/g, '');
  // Ensure we have at least one paragraph
  if (!html) html = '<p></p>';
  return html;
}

/**
 * Convert TipTap JSON document back to plain text.
 */
export function tipTapDocToPlainText(doc: JSONContent): string {
  if (!doc || !doc.content) return '';

  const blocks = doc.content;
  const parts: string[] = [];

  for (const block of blocks) {
    if (block.type === 'blockMath') {
      parts.push(`$$${block.attrs?.latex || ''}$$`);
      continue;
    }

    if (block.type === 'image') {
      const src = block.attrs?.src || '';
      const alt = block.attrs?.alt || '';
      parts.push(`![${alt}](${src})`);
      continue;
    }

    if (block.type === 'paragraph') {
      const inlineText = inlineNodesToText(block.content || []);
      parts.push(inlineText);
      continue;
    }

    // Fallback: try to extract text
    if (block.content) {
      parts.push(inlineNodesToText(block.content));
    }
  }

  return parts.join('\n\n');
}

/**
 * Convert inline TipTap nodes to plain text.
 */
function inlineNodesToText(nodes: JSONContent[]): string {
  return nodes.map(node => {
    if (node.type === 'text') {
      // Escape $ in text nodes to prevent them being parsed as math
      return (node.text || '').replace(/\$/g, '\\$');
    }
    if (node.type === 'inlineMath') {
      return `$${node.attrs?.latex || ''}$`;
    }
    if (node.type === 'image') {
      const src = node.attrs?.src || '';
      const alt = node.attrs?.alt || '';
      return `![${alt}](${src})`;
    }
    if (node.type === 'hardBreak') {
      return '\n';
    }
    // Recurse for other nodes
    if (node.content) {
      return inlineNodesToText(node.content);
    }
    return '';
  }).join('');
}

/**
 * Normalize text for TipTap round-trip stability.
 * Images are block-level in TipTap, so they need \n\n (paragraph break)
 * separation from surrounding content. This handles cases where:
 * - Images are separated by single \n (should be \n\n)
 * - Images are concatenated with text via literal \n (backslash-n from DB)
 * Without this, the serializer round-trip produces different whitespace
 * which triggers phantom "unsaved changes".
 */
export function normalizeForTipTap(text: string): string {
  if (!text) return text;

  // Force \n\n around every image markdown pattern.
  // TipTap treats images as block nodes, so they always get paragraph breaks
  // in the round-trip. Pre-normalizing ensures the input matches the output.
  text = text.replace(/(!\[[^\]]*\]\([^)]+\))/g, '\n\n$1\n\n');

  // Collapse 3+ consecutive newlines to exactly 2
  text = text.replace(/\n{3,}/g, '\n\n');
  // Trim leading/trailing newlines
  text = text.replace(/^\n+/, '');
  text = text.replace(/\n+$/, '');

  return text;
}

/**
 * Normalize text for comparison purposes (phantom-change prevention).
 * Handles differences that TipTap's round-trip introduces:
 * - Images get \n\n separation (via normalizeForTipTap)
 * - Standalone $ gets escaped to \$ in text nodes
 * Only use this for COMPARING texts, not for modifying stored content.
 */
export function normalizeForComparison(text: string): string {
  let t = normalizeForTipTap(text);
  // TipTap escapes $ in text nodes to \$. Normalize both to $ for comparison.
  t = t.replace(/\\\$/g, '$');
  return t;
}

/**
 * Extract the first image URL from plain text (for backward compat with image_url field).
 */
export function extractFirstImageUrl(text: string): string | null {
  const match = text.match(/!\[[^\]]*\]\(([^)]+)\)/);
  return match ? match[1] : null;
}
