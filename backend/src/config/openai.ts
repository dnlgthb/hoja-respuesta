// Cliente de OpenAI - Para análisis de documentos con IA
import OpenAI from 'openai';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { env } from './env';
import { postProcessQuestion, fixLatexInJsonString } from '../utils/mathPostProcess';
import { uploadImage } from './storage';

// Crear cliente de OpenAI con timeout generoso para PDFs grandes
const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
  timeout: 180_000, // 3 min per call — some chunks take 100s+
});

// =============================================
// MATHPIX OCR - Specialized math OCR service
// =============================================
const MATHPIX_API_URL = 'https://api.mathpix.com/v3/pdf';

function getMathpixHeaders(): Record<string, string> {
  return {
    'app_id': env.MATHPIX_APP_ID,
    'app_key': env.MATHPIX_APP_KEY,
  };
}

/**
 * Send a full PDF to Mathpix for OCR and return the transcribed text.
 * Mathpix is specialized in math OCR — exponentes, fracciones, raíces.
 * Flow: POST PDF → poll status → download .mmd (Mathpix Markdown)
 */
async function ocrFullPdfMathpix(pdfBuffer: Buffer): Promise<{ text: string; pdfId: string }> {
  const startTime = Date.now();
  console.log(`  🔢 Mathpix OCR: sending PDF (${(pdfBuffer.length / 1024 / 1024).toFixed(1)}MB)...`);

  // Step 1: Upload PDF
  const formData = new FormData();
  formData.append('file', new Blob([new Uint8Array(pdfBuffer)], { type: 'application/pdf' }), 'prueba.pdf');
  formData.append('options_json', JSON.stringify({
    math_inline_delimiters: ['$', '$'],
    math_display_delimiters: ['$$', '$$'],
    rm_spaces: true,
    enable_tables_fallback: true,
    include_page_info: true,
  }));

  const uploadResponse = await fetch(MATHPIX_API_URL, {
    method: 'POST',
    headers: getMathpixHeaders(),
    body: formData,
  });

  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text();
    throw new Error(`Mathpix upload failed (${uploadResponse.status}): ${errorText}`);
  }

  const { pdf_id } = await uploadResponse.json() as { pdf_id: string };
  console.log(`  🔢 Mathpix: uploaded, pdf_id=${pdf_id}`);

  // Step 2: Poll for completion (max 5 minutes)
  const maxWait = 300_000;
  const pollInterval = 3_000;
  let elapsed = 0;

  while (elapsed < maxWait) {
    await new Promise(resolve => setTimeout(resolve, pollInterval));
    elapsed += pollInterval;

    const statusResponse = await fetch(`${MATHPIX_API_URL}/${pdf_id}`, {
      headers: getMathpixHeaders(),
    });

    if (!statusResponse.ok) {
      const errorText = await statusResponse.text();
      throw new Error(`Mathpix status check failed (${statusResponse.status}): ${errorText}`);
    }

    const status = await statusResponse.json() as {
      status: string;
      percent_done: number;
      num_pages: number;
      num_pages_completed: number;
    };

    if (status.status === 'completed') {
      console.log(`  🔢 Mathpix: completed ${status.num_pages} pages in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
      break;
    }

    if (status.status === 'error') {
      throw new Error(`Mathpix processing failed for pdf_id=${pdf_id}`);
    }

    // Log progress every ~15s
    if (elapsed % 15000 < pollInterval) {
      console.log(`  🔢 Mathpix: ${status.percent_done}% (${status.num_pages_completed}/${status.num_pages} pages)...`);
    }
  }

  if (elapsed >= maxWait) {
    throw new Error(`Mathpix timeout after ${maxWait / 1000}s for pdf_id=${pdf_id}`);
  }

  // Step 3: Download .mmd result
  const mmdResponse = await fetch(`${MATHPIX_API_URL}/${pdf_id}.mmd`, {
    headers: getMathpixHeaders(),
  });

  if (!mmdResponse.ok) {
    const errorText = await mmdResponse.text();
    throw new Error(`Mathpix download failed (${mmdResponse.status}): ${errorText}`);
  }

  const mmdText = await mmdResponse.text();
  const lines = mmdText.split('\n').filter(l => l.trim()).length;
  const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`  📄 Mathpix OCR done: ${lines} lines, ${(mmdText.length / 1024).toFixed(1)}KB (${totalElapsed}s)`);

  return { text: mmdText, pdfId: pdf_id };
}

/**
 * Build a map from question number → PDF page number using OCR text markers.
 * When Mathpix is called with include_page_info: true, the .mmd contains
 * page footer markers like "- N -" (centered, on their own line) at the end of page N.
 * Content AFTER "- N -" is on page N+1.
 */
function buildPageMapFromOcr(ocrText: string): Map<number, number> {
  const lines = ocrText.split('\n');
  const questionToPage = new Map<number, number>();

  // First pass: find all page footer positions and build a line→page map
  // Footer "- N -" marks the end of page N; content after it is on page N+1.
  const pageBreaks: Array<{ lineIdx: number; pageAfter: number }> = [];
  for (let i = 0; i < lines.length; i++) {
    const pageFooter = lines[i].trim().match(/^-\s*(\d+)\s*-$/);
    if (pageFooter) {
      pageBreaks.push({ lineIdx: i, pageAfter: parseInt(pageFooter[1], 10) + 1 });
    }
  }

  // Second pass: for each question, find which page it's on
  for (let i = 0; i < lines.length; i++) {
    const questionStart = lines[i].match(/^(\d+)\.\s/);
    if (!questionStart) continue;

    const qNum = parseInt(questionStart[1], 10);
    if (qNum < 1 || qNum > 100) continue;
    // Use LAST occurrence: cover page instructions also have "1.", "2.", etc.
    // Real questions come after instructions, so the last match wins.

    // Find the last page break before this line
    let page = 1; // default: before any footer
    for (const pb of pageBreaks) {
      if (pb.lineIdx < i) {
        page = pb.pageAfter;
      } else {
        break;
      }
    }
    questionToPage.set(qNum, page);
  }

  return questionToPage;
}

/**
 * Split Mathpix Markdown text into chunks for Phase 2 structuring.
 * Splits by approximate line count, trying to break at question boundaries.
 */
function splitMathpixTextIntoChunks(text: string, linesPerChunk: number = 120): string[] {
  const lines = text.split('\n');
  if (lines.length <= linesPerChunk) return [text];

  const chunks: string[] = [];
  let currentChunk: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    currentChunk.push(lines[i]);

    if (currentChunk.length >= linesPerChunk) {
      // Try to break at a question boundary (line starting with number + period)
      let breakIdx = currentChunk.length - 1;
      for (let j = currentChunk.length - 1; j >= currentChunk.length - 20 && j >= 0; j--) {
        if (/^\d+\.\s/.test(currentChunk[j])) {
          breakIdx = j;
          break;
        }
      }

      // Push everything before the break point
      chunks.push(currentChunk.slice(0, breakIdx).join('\n'));
      // Start new chunk with the question that was at the break point
      currentChunk = currentChunk.slice(breakIdx);
    }
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join('\n'));
  }

  return chunks;
}

// =============================================
// PHASE 1: OCR - Faithful visual transcription
// =============================================
const OCR_SYSTEM_PROMPT = `Eres un sistema de OCR especializado en documentos educativos con notación matemática.

TU ÚNICA TAREA: Transcribir EXACTAMENTE lo que ves en cada página del PDF. NO interpretes, NO simplifiques, NO reestructures.

REGLAS DE TRANSCRIPCIÓN:
1. Transcribe CADA página separándolas con "--- PÁGINA X ---"
2. Copia el texto LITERALMENTE, carácter por carácter
3. Para expresiones matemáticas, usa LaTeX entre $...$
4. Mantén la estructura visual: números de pregunta, opciones (A, B, C, D), etc.

REGLAS CRÍTICAS PARA NOTACIÓN MATEMÁTICA:

SUPERÍNDICES/EXPONENTES — Un número o expresión pequeño ARRIBA de otro es un EXPONENTE:
  - "14" con "2" pequeño arriba → $14^{2}$
  - "2" con "6" pequeño arriba → $2^{6}$ (NO $26$ ni $2 \\times 6$)
  - "10" con "2" pequeño arriba → $10^{2}$
  - "(888)" con "2" pequeño arriba → $(888)^{2}$
  - NUNCA confundas un exponente con multiplicación

PRODUCTOS CON MÚLTIPLES EXPONENTES — CADA factor tiene su PROPIO exponente:
  - "2⁶ · 111²" → $2^{6} \\cdot 111^{2}$ (el 6 es exponente de 2, el 2 es exponente de 111)
  - "3⁴ · 7²" → $3^{4} \\cdot 7^{2}$ (el 4 es exponente de 3, el 2 es exponente de 7)
  - "2³ · 5² · 11" → $2^{3} \\cdot 5^{2} \\cdot 11$
  - REGLA: Lee CADA base con SU exponente de izquierda a derecha. NO muevas exponentes entre factores.
  - ERROR COMÚN: "2⁶ · 111²" transcrito como "$2 \\cdot 111^{6}$" — INCORRECTO, cada exponente pertenece a su base

EXPONENTES FRACCIONARIOS — Si el exponente es una fracción pequeña arriba:
  - "2" con "9/2" arriba → $2^{\\frac{9}{2}}$
  - "2" con "-1/6" arriba → $2^{-\\frac{1}{6}}$
  - NUNCA escribas el exponente fraccionario como una fracción independiente

SUBÍNDICES — Un número o letra pequeño ABAJO es un subíndice:
  - "D" con "AB" abajo → $D_{AB}$
  - "x" con "1" abajo → $x_{1}$
  - "log" con "2" abajo → $\\log_{2}$

RAÍCES:
  - √2 → $\\sqrt{2}$
  - √(2⁶) → $\\sqrt{2^{6}}$
  - ³√8 (raíz cúbica) → $\\sqrt[3]{8}$
  - ⁿ√x (raíz n-ésima) → $\\sqrt[n]{x}$
  - NUNCA confundas √ con una fracción

FRACCIONES — Barra horizontal con expresiones arriba y abajo:
  - Numerador arriba, denominador abajo → $\\frac{numerador}{denominador}$
  - Fracciones anidadas: $\\frac{\\frac{a}{b}}{\\frac{c}{d}}$

PRODUCTO/MULTIPLICACIÓN:
  - Punto centrado (·) → $\\cdot$
  - Signo × → $\\times$
  - Multiplicación implícita (2x sin símbolo) → $2x$

LOGARITMOS:
  - log₂(x) → $\\log_{2}(x)$
  - ln(x) → $\\ln(x)$
  - log(x) → $\\log(x)$

TRIGONOMETRÍA:
  - sen(x) o sin(x) → $\\sin(x)$
  - cos(x) → $\\cos(x)$
  - tan(x) → $\\tan(x)$
  - sin²(x) → $\\sin^{2}(x)$

CONJUNTOS:
  - ∩ (intersección) → $\\cap$
  - ∪ (unión) → $\\cup$
  - ∈ (pertenece) → $\\in$
  - ⊂ (subconjunto) → $\\subset$

OTROS SÍMBOLOS:
  - ° (grados) → $^{\\circ}$ (ej: $135^{\\circ}$)
  - π → $\\pi$
  - ∞ → $\\infty$
  - ≤ → $\\leq$, ≥ → $\\geq$, ≠ → $\\neq$
  - → (flecha) → $\\to$
  - ± → $\\pm$
  - Notación científica: 2×10⁻⁵ → $2 \\times 10^{-5}$

VECTORES:
  - Flecha sobre letra → $\\vec{u}$, $\\vec{v}$

FORMATO DE SALIDA — Texto plano con la transcripción fiel de cada página.
Si una página es portada, instrucciones o está en blanco, escribe "[Página de instrucciones/portada/blanco]".
Si hay una imagen, tabla o gráfico, descríbelo entre corchetes: [Imagen: descripción]
Si las opciones de una pregunta son imágenes/gráficos, descríbelas: "A) [Gráfico: descripción]"`;

// =============================================
// PHASE 2: Structuring - Parse OCR into JSON
// =============================================
const STRUCTURE_SYSTEM_PROMPT = `Eres un asistente que estructura texto transcrito de pruebas educativas en formato JSON.

Recibirás la transcripción fiel (OCR) de una prueba. Tu trabajo es ESTRUCTURAR ese texto en JSON, sin modificar las expresiones matemáticas.

INSTRUCCIONES:
1. Identifica cada pregunta por su número
2. Clasifica el tipo según las reglas de abajo
3. Extrae el texto completo, opciones y contexto
4. Las expresiones matemáticas ya vienen en LaTeX con $...$  — cópialas TAL CUAL

CLASIFICACIÓN DE TIPO:
- MULTIPLE_CHOICE: Tiene opciones A), B), C), D). La gran mayoría de preguntas en pruebas estandarizadas son de este tipo.
- TRUE_FALSE: Afirmación para evaluar como Verdadera o Falsa. Puede requerir justificación.
- MATH: Pregunta abierta donde el estudiante debe dar un resultado numérico/expresión. Señales: "Calcula", "Determina el valor", "Resuelve". NO tiene opciones.
- DEVELOPMENT: Pregunta abierta de redacción/explicación. Señales: "Explica", "Justifica", "Analiza", "Describe". NO tiene opciones.
NOTA: Si una pregunta tiene opciones A/B/C/D, SIEMPRE es MULTIPLE_CHOICE, sin importar si el contenido es matemático.

REGLAS PARA EXPRESIONES MATEMÁTICAS:
- NUNCA modifiques las expresiones de la transcripción
- Copia EXACTAMENTE: $14^{2}$, $(888)^{2}$, $2^{6} \\cdot 111^{2}$, etc.
- NO cambies \\cdot por \\times ni viceversa — copia el operador exacto del texto
- NO cambies \\sqrt{X} por \\sqrt(X) — mantén las llaves {} tal como están
- NO cambies \\mathrm por \\text ni viceversa — copia el comando exacto
- Opciones: incluye la letra y contenido completo. Ej: "A) $2^{6} \\cdot 111^{2}$"
- Si una opción dice "[Ver imagen en el PDF]" o similar, mantenlo

VALIDACIÓN DE OPCIONES:
- MULTIPLE_CHOICE debe tener exactamente 4 opciones (A, B, C, D)
- Si solo encuentras 3 opciones visibles y hay una imagen, la 4ta podría estar en la imagen
- NO inventes opciones que no estén en la transcripción

PREGUNTAS CON IMÁGENES:
- Si la transcripción contiene ![](URL) o ![caption](URL) antes o dentro de una pregunta, pon has_image: true, la URL en image_url, y una descripción breve en image_description
- Si hay MÚLTIPLES imágenes para una pregunta (ej: ![Caja 1](URL1) ![Caja 2](URL2)), usa la primera URL en image_url y pon TODAS las URLs adicionales en el campo "text" como ![caption](URL)
- Si las opciones son imágenes (ej: ![B)](URL)), mantén la sintaxis ![caption](URL) dentro de las opciones
- Si la transcripción indica [Imagen: ...], pon has_image: true y la descripción en image_description
- NO incluyas la PRIMERA ![](URL) dentro de "text" — extráela al campo image_url
- FIGURAS/CARTELES SIN IMAGEN: Si el texto dice "En la figura", "el cartel", "la imagen adjunta" pero NO hay ![](URL), el OCR probablemente extrajo la figura como texto parcial. En ese caso pon has_image: true y en image_description escribe "[Imagen no extraída por OCR - verificar en PDF original]". Incluye todo el texto extraído del cartel/figura en "context".

TEXTO INTRODUCTORIO Y CONTEXTO:
- Si hay texto introductorio/escenario ANTES de la pregunta real (ej: "Un diario tiene una colilla recortable..."), ponlo en "context"
- "text" debe contener SOLO la pregunta directa (la oración interrogativa o instrucción)
- Si hay un enunciado general para varias sub-preguntas, ponlo en "context" de cada sub-pregunta
- IMPORTANTE: Si hay tablas (\\begin{tabular}, \\begin{array}, \\begin{table}), listas, o datos estructurados entre el texto introductorio y la pregunta, INCLÚYELOS COMPLETOS en "context" — NO los omitas
- Ejemplo: context="En la siguiente tabla se presentan las fechas:\n\n| Hecho | Año |\n|---|---|\n| Gran Pirámide | -2560 |\n| Cleopatra | -69 |", text="¿Cuántos años pasaron desde...?"
- Ejemplo: context="Considera la siguiente recta numérica:", text="¿Cuál de los siguientes procedimientos representa...?"

Responde ÚNICAMENTE con JSON válido:
{
  "questions": [
    {
      "number": "1",
      "type": "MULTIPLE_CHOICE",
      "text": "¿Cuál es el resultado de $3 - (-1)(-1-5)$?",
      "context": null,
      "options": ["A) $-1$", "B) $-3$", "C) $-12$", "D) $-24$"],
      "correct_answer": null,
      "points": 1,
      "has_image": false,
      "image_description": null,
      "image_page": null,
      "image_url": null
    }
  ]
}

IMPORTANTE:
- "text" DEBE incluir la instrucción completa, no solo la fórmula
- "number" es STRING (permite "I.a", "2.b", etc.)
- Si hay puntaje indicado, úsalo; si no, usa 1 punto
- Si no hay preguntas en la transcripción, retorna {"questions": []}
- NO omitas preguntas — si la transcripción tiene preguntas 1-15, el JSON debe tener las 15`;

// Tipo para callback de progreso
export type ProgressCallback = (data: {
  type: 'progress';
  batch: number;
  totalBatches: number;
  pages: string;
  questionsFound: number;
  message: string;
}) => void;

/**
 * PHASE 1: OCR - Send PDF chunk to vision model for faithful transcription.
 * Returns raw text transcription, NOT structured JSON.
 */
async function ocrPdfChunk(
  chunkBase64: string,
  chunkInfo: string
): Promise<string> {
  const startTime = Date.now();
  console.log(`  👁️ Phase 1 (OCR): ${chunkInfo} — modelo: ${env.OPENAI_VISION_MODEL}`);

  const completion = await openai.chat.completions.create({
    model: env.OPENAI_VISION_MODEL,
    messages: [
      {
        role: 'system',
        content: OCR_SYSTEM_PROMPT,
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Transcribe FIELMENTE todo el contenido de este fragmento de prueba educativa (${chunkInfo}). Copia exactamente lo que ves, especialmente la notación matemática con exponentes, raíces y fracciones. Usa LaTeX entre $...$ para las expresiones matemáticas.`,
          },
          {
            type: 'file',
            file: {
              filename: 'prueba.pdf',
              file_data: `data:application/pdf;base64,${chunkBase64}`,
            },
          },
        ],
      },
    ],
    temperature: 0.0,
    max_tokens: 16000,
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const transcription = completion.choices[0].message.content || '';
  const lines = transcription.split('\n').filter(l => l.trim()).length;

  console.log(`  📄 Phase 1 done: ${lines} lines transcribed (${elapsed}s)`);
  return transcription;
}

/**
 * PHASE 2: Structure - Send OCR transcription to text model to parse into JSON.
 * No vision needed here, just text comprehension.
 */
async function structureTranscription(
  transcription: string,
  chunkInfo: string
): Promise<any[]> {
  const startTime = Date.now();
  console.log(`  🏗️ Phase 2 (Structure): parsing transcription into JSON — modelo: ${env.OPENAI_MODEL}`);

  // Hard abort after 150s — OpenAI sometimes accepts the request but hangs
  // indefinitely (SDK timeout only covers connection, not slow responses)
  const abortController = new AbortController();
  const abortTimer = setTimeout(() => abortController.abort(), 150_000);

  let completion;
  try {
    completion = await openai.chat.completions.create({
      model: env.OPENAI_MODEL,
      messages: [
        {
          role: 'system',
          content: STRUCTURE_SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: `Aquí está la transcripción fiel (OCR) de un fragmento de prueba educativa (${chunkInfo}). Estructura las preguntas en formato JSON. COPIA las expresiones matemáticas EXACTAMENTE como están en la transcripción, sin modificar nada.\n\nTRANSCRIPCIÓN:\n${transcription}`,
        },
      ],
      temperature: 0.0,
      max_tokens: 16000,
      response_format: { type: 'json_object' },
    }, { signal: abortController.signal });
  } finally {
    clearTimeout(abortTimer);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const responseText = completion.choices[0].message.content || '{}';

  // Fix LaTeX backslashes BEFORE JSON.parse to prevent escape destruction
  const fixedJson = fixLatexInJsonString(responseText);
  if (fixedJson !== responseText) {
    console.log(`  🔧 Fixed LaTeX escapes in JSON response`);
  }

  const parsed = JSON.parse(fixedJson);
  const rawQuestions = parsed.questions || [];

  console.log(`  📝 Phase 2 done: ${rawQuestions.length} questions structured (${elapsed}s)`);

  // Post-process: convert Unicode math to LaTeX, fix bare commands, repair broken escapes
  const questions = rawQuestions.map((q: any) => postProcessQuestion(q));

  return questions;
}

/**
 * Two-phase analysis of a PDF chunk:
 * Phase 1 (OCR): Vision model transcribes the PDF faithfully as text
 * Phase 2 (Structure): Text model parses the transcription into JSON
 */
async function analyzeDocumentChunk(
  chunkBase64: string,
  chunkInfo: string
): Promise<any[]> {
  // Phase 1: Faithful OCR transcription
  const transcription = await ocrPdfChunk(chunkBase64, chunkInfo);

  // Skip only completely empty transcriptions
  if (!transcription.trim()) {
    console.log(`  ⏭️ Skipping chunk (empty transcription): ${chunkInfo}`);
    return [];
  }

  // Don't skip chunks that contain instruction/cover page markers —
  // they may also contain questions on other pages within the same chunk.
  // Phase 2 (Structure) will simply return [] if no questions are found.

  // Phase 2: Structure into JSON
  const questions = await structureTranscription(transcription, chunkInfo);

  return questions;
}

/**
 * Analizar PDF con vision API y extraer preguntas.
 * Para PDFs grandes (>15 páginas), divide en chunks y procesa cada uno por separado.
 * @param chunks - Array de chunks del PDF (de splitPdfIntoChunks)
 * @param onProgress - Optional callback para reportar progreso
 * @returns Array de preguntas estructuradas
 */
export async function analyzeDocument(
  chunks: Array<{ base64: string; startPage: number; endPage: number; totalPages: number }>,
  onProgress?: ProgressCallback
) {
  // Un solo chunk → llamada directa
  if (chunks.length === 1) {
    console.log(`📄 Analizando PDF completo (${chunks[0].totalPages} páginas)...`);
    onProgress?.({
      type: 'progress',
      batch: 1,
      totalBatches: 1,
      pages: `1-${chunks[0].totalPages}`,
      questionsFound: 0,
      message: `Analizando PDF (${chunks[0].totalPages} páginas)...`,
    });
    const questions = await analyzeDocumentChunk(chunks[0].base64, `${chunks[0].totalPages} páginas`);
    console.log(`📄 Completado: ${questions.length} preguntas encontradas`);
    return questions;
  }

  // Múltiples chunks → procesar en paralelo de a CONCURRENCY chunks
  const CONCURRENCY = 2;
  console.log(`📄 PDF grande: ${chunks[0].totalPages} páginas → ${chunks.length} batches (concurrencia: ${CONCURRENCY})`);
  const allQuestions: any[] = [];

  for (let i = 0; i < chunks.length; i += CONCURRENCY) {
    const batch = chunks.slice(i, i + CONCURRENCY);
    const batchPromises = batch.map((chunk, j) => {
      const idx = i + j;
      const chunkInfo = `páginas ${chunk.startPage}-${chunk.endPage} de ${chunk.totalPages}`;
      console.log(`  🔄 Batch ${idx + 1}/${chunks.length}: ${chunkInfo}...`);
      return analyzeDocumentChunk(chunk.base64, chunkInfo).then(questions => {
        console.log(`  ✅ Batch ${idx + 1}: ${questions.length} preguntas encontradas`);
        return { idx, questions };
      });
    });

    // Report progress for this parallel group
    const pagesStr = batch.map(c => `${c.startPage}-${c.endPage}`).join(', ');
    onProgress?.({
      type: 'progress',
      batch: Math.min(i + CONCURRENCY, chunks.length),
      totalBatches: chunks.length,
      pages: pagesStr,
      questionsFound: allQuestions.length,
      message: `Procesando batches ${i + 1}-${Math.min(i + CONCURRENCY, chunks.length)} de ${chunks.length} (págs. ${pagesStr})...`,
    });

    const results = await Promise.all(batchPromises);
    // Sort by original index to maintain page order
    results.sort((a, b) => a.idx - b.idx);
    for (const r of results) {
      allQuestions.push(...r.questions);
    }
  }

  console.log(`📄 Total: ${allQuestions.length} preguntas extraídas de ${chunks.length} batches`);
  return allQuestions;
}

/**
 * Render a LaTeX table to a PNG image using QuickLaTeX API.
 * QuickLaTeX is a free service that supports full LaTeX including tabular, multirow, etc.
 * @param latexCode - Raw LaTeX code (e.g., \begin{tabular}...\end{tabular})
 * @returns PNG image as Buffer, or null if rendering failed
 */
async function renderLatexTableToImage(latexCode: string): Promise<{ buffer: Buffer; url: string } | null> {
  try {
    // Pre-process LaTeX to fix common Mathpix formatting issues
    let cleaned = latexCode;

    // Fix \cline { 2 - 2 } → \cline{2-2} (remove spaces inside braces)
    cleaned = cleaned.replace(/\\cline\s*\{\s*(\d+)\s*-\s*(\d+)\s*\}/g, '\\cline{$1-$2}');

    // Wrap in a minimal LaTeX document fragment with common packages
    const preamble = '\\usepackage{amsmath}\n\\usepackage{amssymb}\n\\usepackage{multirow}\n\\usepackage{array}';

    // Build body manually with encodeURIComponent — URLSearchParams encodes
    // spaces as '+' which QuickLaTeX renders as literal '+' characters
    const body = [
      `formula=${encodeURIComponent(cleaned)}`,
      `fsize=17px`,
      `fcolor=000000`,
      `mode=0`,
      `out=1`,
      `remhost=quicklatex.com`,
      `preamble=${encodeURIComponent(preamble)}`,
    ].join('&');

    const response = await fetch('https://quicklatex.com/latex3.f', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    const text = await response.text();
    // QuickLaTeX returns: status\r\nurl width height depth\r\n...
    const lines = text.trim().split('\n');
    const status = lines[0]?.trim();

    if (status !== '0') {
      console.warn(`  ⚠️ QuickLaTeX render failed (status=${status}): ${lines.slice(1).join(' ').substring(0, 200)}`);
      return null;
    }

    // Second line: URL width height depth
    const parts = lines[1]?.trim().split(/\s+/);
    const imageUrl = parts?.[0];
    if (!imageUrl || !imageUrl.startsWith('http')) {
      console.warn(`  ⚠️ QuickLaTeX returned invalid URL: ${lines[1]}`);
      return null;
    }

    // Download the rendered image
    const imgResponse = await fetch(imageUrl);
    if (!imgResponse.ok) {
      console.warn(`  ⚠️ Failed to download QuickLaTeX image: ${imgResponse.status}`);
      return null;
    }

    return { buffer: Buffer.from(await imgResponse.arrayBuffer()), url: imageUrl };
  } catch (err) {
    console.warn(`  ⚠️ QuickLaTeX error: ${(err as Error).message}`);
    return null;
  }
}

/**
 * Convert \begin{tabular}...\end{tabular} blocks in Mathpix .mmd text to images.
 * Tables are rendered to PNG via QuickLaTeX, uploaded to Supabase, and replaced
 * with ![table](supabase_url) markdown in the text.
 * This runs BEFORE Phase 2 so the AI sees images instead of raw LaTeX tables.
 */
async function convertTablesToImages(mmdText: string, testId: string): Promise<string> {
  // Match tabular-like environments, handling nesting by counting begin/end pairs
  const envNames = '(?:tabular|tabularx|array|longtable)';
  const matches: { text: string; index: number }[] = [];
  const beginRe = new RegExp(`\\\\begin\\{${envNames}\\}`, 'g');
  let m: RegExpExecArray | null;

  while ((m = beginRe.exec(mmdText)) !== null) {
    const startIdx = m.index;
    // Count nesting depth to find the matching \end
    let depth = 1;
    let pos = m.index + m[0].length;
    const beginInner = new RegExp(`\\\\begin\\{${envNames}\\}`, 'g');
    const endInner = new RegExp(`\\\\end\\{${envNames}\\}`, 'g');
    let endPos = -1;

    while (depth > 0 && pos < mmdText.length) {
      beginInner.lastIndex = pos;
      endInner.lastIndex = pos;
      const nextBegin = beginInner.exec(mmdText);
      const nextEnd = endInner.exec(mmdText);
      if (!nextEnd) break; // no closing tag found
      if (nextBegin && nextBegin.index < nextEnd.index) {
        depth++;
        pos = nextBegin.index + nextBegin[0].length;
      } else {
        depth--;
        if (depth === 0) {
          endPos = nextEnd.index + nextEnd[0].length;
        }
        pos = nextEnd.index + nextEnd[0].length;
      }
    }

    if (endPos !== -1) {
      const tableText = mmdText.substring(startIdx, endPos);
      matches.push({ text: tableText, index: startIdx });
      // Skip past this table to avoid matching inner tables again
      beginRe.lastIndex = endPos;
    }
  }

  if (matches.length === 0) {
    console.log('  📊 No LaTeX tables found in .mmd text');
    return mmdText;
  }

  console.log(`  📊 Found ${matches.length} LaTeX tables to convert to images...`);
  let result = mmdText;
  let succeeded = 0;

  for (const match of matches) {
    const fullMatch = match.text;

    // Render the table to an image
    const renderResult = await renderLatexTableToImage(fullMatch);
    if (!renderResult) {
      console.warn(`  ⚠️ Skipping table (render failed), keeping as text`);
      continue;
    }

    // Try uploading to Supabase, fall back to QuickLaTeX URL
    let imageUrl = renderResult.url; // fallback
    try {
      const hash = crypto.createHash('md5').update(fullMatch).digest('hex').slice(0, 12);
      const filePath = `img_${testId}_tbl_${hash}`;
      imageUrl = await uploadImage(renderResult.buffer, filePath, 'image/png');
    } catch (err) {
      console.warn(`  ⚠️ Supabase upload failed, using QuickLaTeX URL: ${(err as Error).message}`);
    }

    // Replace the LaTeX table with an image reference
    result = result.replace(fullMatch, `\n![tabla](${imageUrl})\n`);
    succeeded++;
  }

  console.log(`  📊 Converted ${succeeded}/${matches.length} tables to images`);
  return result;
}

/**
 * Normalize Mathpix \begin{figure}...\end{figure} blocks into Markdown ![caption](URL).
 * Mathpix outputs images in two formats:
 *   1. Markdown: ![](URL) — already handled
 *   2. LaTeX: \begin{figure}\includegraphics[...]{URL}\caption{X}\end{figure} — needs normalization
 * This must run BEFORE extractAndRehostImages so the unified ![](URL) regex catches everything.
 */
function normalizeMathpixFigures(mmdText: string): string {
  // Step 1: Match \begin{figure}...\end{figure} blocks (caption before or after \includegraphics)
  const figureRegex = /\\begin\{figure\}[\s\S]*?\\end\{figure\}/g;
  let figureCount = 0;

  let result = mmdText.replace(figureRegex, (block) => {
    // Extract URL from \includegraphics[...]{URL}
    const urlMatch = block.match(/\\includegraphics\[[^\]]*\]\{(https?:\/\/[^}]+)\}/);
    if (!urlMatch) return block; // No URL found, leave as-is

    // Extract caption from \caption{...}
    const captionMatch = block.match(/\\caption\{([^}]*)\}/);
    const caption = captionMatch ? captionMatch[1].trim() : '';

    figureCount++;
    return `![${caption}](${urlMatch[1]})`;
  });

  // Step 2: Convert standalone \includegraphics[...]{url} outside of figure blocks
  // These are missed by the figure block regex above
  const standaloneRegex = /\\includegraphics\[([^\]]*)\]\{(https?:\/\/[^}]+)\}/g;
  let standaloneCount = 0;

  result = result.replace(standaloneRegex, (_match, _attrs, url) => {
    standaloneCount++;
    return `![](${url})`;
  });

  if (figureCount > 0 || standaloneCount > 0) {
    console.log(`  🔄 Normalized ${figureCount} figure blocks + ${standaloneCount} standalone \\includegraphics → ![](URL)`);
  }
  return result;
}

/**
 * Extract Mathpix CDN image URLs from .mmd text, download them,
 * upload to Supabase Storage (permanent), and replace URLs in the text.
 * Mathpix CDN URLs expire after ~30 days, so we must re-host them.
 * @param mmdText - Raw Mathpix Markdown text with ![](cdn.mathpix.com/...) refs
 * @param testId - Test ID for organizing images in storage
 * @returns Text with Mathpix URLs replaced by Supabase URLs
 */
async function extractAndRehostImages(mmdText: string, testId: string): Promise<string> {
  // Match both Markdown ![alt](url) AND LaTeX \includegraphics[...]{url} formats
  // Mathpix .mmd uses both syntaxes depending on context
  const mdImageRegex = /!\[([^\]]*)\]\((https:\/\/cdn\.mathpix\.com\/cropped\/[^)]+)\)/g;
  const latexImageRegex = /\\includegraphics\[([^\]]*)\]\{(https:\/\/cdn\.mathpix\.com\/cropped\/[^}]+)\}/g;

  // Collect all matches with their format type
  type ImageMatch = { fullMatch: string; altText: string; url: string };
  const allMatches: ImageMatch[] = [];

  for (const m of mmdText.matchAll(mdImageRegex)) {
    allMatches.push({ fullMatch: m[0], altText: m[1], url: m[2] });
  }
  for (const m of mmdText.matchAll(latexImageRegex)) {
    allMatches.push({ fullMatch: m[0], altText: '', url: m[2] });
  }

  if (allMatches.length === 0) {
    console.log('  🖼️ No Mathpix images found in .mmd text');
    return mmdText;
  }

  console.log(`  🖼️ Found ${allMatches.length} Mathpix images to re-host...`);
  let result = mmdText;
  let succeeded = 0;

  // Process images concurrently (max 5 at a time)
  const CONCURRENCY = 5;
  for (let i = 0; i < allMatches.length; i += CONCURRENCY) {
    const batch = allMatches.slice(i, i + CONCURRENCY);
    const promises = batch.map(async (match) => {
      try {
        // Download image from Mathpix CDN
        const response = await fetch(match.url);
        if (!response.ok) {
          console.warn(`  ⚠️ Failed to download image: ${response.status} ${match.url.slice(0, 80)}...`);
          return null;
        }
        const buffer = Buffer.from(await response.arrayBuffer());

        // Determine content type from URL
        const isJpg = match.url.includes('.jpg') || match.url.includes('.jpeg');
        const contentType = isJpg ? 'image/jpeg' : 'image/png';

        // Generate a short, unique filename using a hash of the FULL URL
        // (including crop params) so different crops of the same page get distinct files
        // Short names prevent gpt-4o-mini from truncating URLs during Phase 2
        const urlHash = crypto.createHash('md5').update(match.url).digest('hex').slice(0, 12);
        const filePath = `img_${testId}_${urlHash}`;

        // Upload to Supabase
        const supabaseUrl = await uploadImage(buffer, filePath, contentType);
        return { ...match, supabaseUrl };
      } catch (err) {
        console.warn(`  ⚠️ Error re-hosting image: ${(err as Error).message}`);
        return null;
      }
    });

    const results = await Promise.all(promises);
    for (const r of results) {
      if (r) {
        // Replace the original reference with Markdown image syntax
        result = result.replace(r.fullMatch, `![${r.altText}](${r.supabaseUrl})`);
        succeeded++;
      }
    }
  }

  console.log(`  🖼️ Re-hosted ${succeeded}/${allMatches.length} images to Supabase`);
  return result;
}

// =============================================
// PHASE 1.3: Composite Figure Detection & Merging
// =============================================

/** Parsed crop from Mathpix CDN URL */
interface MathpixCrop {
  /** Full markdown match, e.g. ![caption](url) */
  fullMatch: string;
  /** The CDN URL */
  url: string;
  /** Alt/caption text */
  altText: string;
  /** Page number from the URL (e.g., "03" from ...-03.jpg) */
  page: string;
  /** Crop coordinates from query params */
  top_left_x: number;
  top_left_y: number;
  width: number;
  height: number;
  /** Character index in the .mmd text where this match starts */
  charIndex: number;
  /** Character index where this match ends */
  charEnd: number;
  /** UUID prefix from the URL (e.g., cce1a75b-e160-401f-ad8e-45d053bf00aa) */
  uuid: string;
}

/**
 * Parse all Mathpix CDN image references from .mmd text (after normalizeMathpixFigures).
 * At this point all images are in ![alt](url) format.
 * Groups them by page number.
 */
function parseMathpixCrops(mmdText: string): Map<string, MathpixCrop[]> {
  const regex = /!\[([^\]]*)\]\((https:\/\/cdn\.mathpix\.com\/cropped\/([a-f0-9-]+)-(\d+)\.jpg\?([^)]+))\)/g;
  const byPage = new Map<string, MathpixCrop[]>();

  let match: RegExpExecArray | null;
  while ((match = regex.exec(mmdText)) !== null) {
    const [fullMatch, altText, url, uuid, page, queryString] = match;
    const params = new URLSearchParams(queryString);

    const crop: MathpixCrop = {
      fullMatch,
      url,
      altText,
      page,
      uuid,
      top_left_x: parseInt(params.get('top_left_x') || '0', 10),
      top_left_y: parseInt(params.get('top_left_y') || '0', 10),
      width: parseInt(params.get('width') || '0', 10),
      height: parseInt(params.get('height') || '0', 10),
      charIndex: match.index,
      charEnd: match.index + fullMatch.length,
    };

    const crops = byPage.get(page) || [];
    crops.push(crop);
    byPage.set(page, crops);
  }

  return byPage;
}

/**
 * Group crops by Y-range overlap using Union-Find.
 * Crops that share any vertical overlap are part of the same composite figure.
 * This is deterministic, free, and instant — unlike GPT-4o Vision.
 *
 * Example: Cuadrado mágico has a grid (left, y=1321-1795) + formula (right, y=1364-1410)
 * + result box (right, y=1528-1604). All 3 overlap with the grid's Y range → merge.
 *
 * Counter-example: Sailboat options (A-E) are stacked vertically with large Y gaps → separate.
 */
function groupCropsByYOverlap(
  crops: MathpixCrop[]
): { compositeGroups: number[][]; separateIndices: number[] } {
  const n = crops.length;
  // Union-Find
  const parent = Array.from({ length: n }, (_, i) => i);
  function find(x: number): number {
    while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
    return x;
  }
  function union(a: number, b: number) {
    parent[find(a)] = find(b);
  }

  // Check all pairs for Y-range overlap
  for (let i = 0; i < n; i++) {
    const aTop = crops[i].top_left_y;
    const aBot = aTop + crops[i].height;
    for (let j = i + 1; j < n; j++) {
      const bTop = crops[j].top_left_y;
      const bBot = bTop + crops[j].height;
      // Overlap if one starts before the other ends
      if (aTop < bBot && bTop < aBot) {
        union(i, j);
      }
    }
  }

  // Collect groups
  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(i);
  }

  const compositeGroups: number[][] = [];
  const separateIndices: number[] = [];
  for (const members of groups.values()) {
    if (members.length >= 2) {
      compositeGroups.push(members);
    } else {
      separateIndices.push(members[0]);
    }
  }

  return { compositeGroups, separateIndices };
}

/**
 * Compute the merged bounding box for a group of crops.
 * Returns expanded coordinates with padding to capture content between crops.
 */
function computeMergedBoundingBox(crops: MathpixCrop[], padding: number = 120): {
  top_left_x: number;
  top_left_y: number;
  width: number;
  height: number;
} {
  const minX = Math.max(0, Math.min(...crops.map(c => c.top_left_x)) - padding);
  const minY = Math.max(0, Math.min(...crops.map(c => c.top_left_y)) - padding);
  const maxX = Math.max(...crops.map(c => c.top_left_x + c.width)) + padding;
  const maxY = Math.max(...crops.map(c => c.top_left_y + c.height)) + padding;

  return {
    top_left_x: minX,
    top_left_y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Phase 1.3: Detect and merge composite figures in Mathpix .mmd text.
 *
 * For pages with 2+ image crops, sends the full page image to GPT-4o Vision
 * to determine which crops belong to the same composite figure.
 * Merged crops get a single bounding box URL; the .mmd text range
 * (from first crop to last crop, including interleaved OCR text) is replaced
 * with a single ![](mergedUrl).
 *
 * Must run AFTER normalizeMathpixFigures (Phase 1.25) and BEFORE extractAndRehostImages (Phase 1.5).
 */
async function mergeCompositeFigures(mmdText: string): Promise<string> {
  const byPage = parseMathpixCrops(mmdText);

  // Filter to pages with 2+ crops (only those need composite analysis)
  const multiCropPages = Array.from(byPage.entries()).filter(([, crops]) => crops.length >= 2);

  if (multiCropPages.length === 0) {
    console.log('  🧩 No pages with multiple crops — skipping composite detection');
    return mmdText;
  }

  console.log(`  🧩 Analyzing ${multiCropPages.length} pages with multiple crops for composites...`);

  // Analyze pages concurrently (they're independent)
  type Replacement = { startChar: number; endChar: number; newText: string };
  const allReplacements: Replacement[] = [];

  const analysisPromises = multiCropPages.map(async ([page, crops]) => {
    try {
      const firstCrop = crops[0];

      // Use deterministic Y-overlap heuristic instead of GPT-4o Vision
      const result = groupCropsByYOverlap(crops);
      console.log(`  🧩 Page ${page}: ${result.compositeGroups.length} composite group(s), ${result.separateIndices.length} separate (Y-overlap heuristic)`);

      // Process each composite group
      for (const group of result.compositeGroups) {
        if (group.length < 2) continue; // Single-crop "group" — nothing to merge

        const groupCrops = group.map(i => crops[i]).filter(Boolean);
        if (groupCrops.length < 2) continue;

        // Compute merged bounding box
        const merged = computeMergedBoundingBox(groupCrops);

        // Build merged CDN URL using the same UUID and page
        const mergedUrl = `https://cdn.mathpix.com/cropped/${firstCrop.uuid}-${page}.jpg?height=${merged.height}&width=${merged.width}&top_left_y=${merged.top_left_y}&top_left_x=${merged.top_left_x}`;

        // Find the text range to replace: from start of first crop to end of last crop
        // Sort group crops by char position
        const sorted = [...groupCrops].sort((a, b) => a.charIndex - b.charIndex);
        const rangeStart = sorted[0].charIndex;
        let rangeEnd = sorted[sorted.length - 1].charEnd;

        // Extend rangeEnd to absorb "orphan" OCR text that Mathpix extracted
        // from inside the composite image. This text appears after the last crop
        // but before the actual question text (e.g. "Resultado\nNombre...\nNúmero contact").
        // Boundaries: next question number, question mark sentence, image, or options.
        const textAfter = mmdText.slice(rangeEnd);
        const nextBoundary = textAfter.search(/\n\d+\.\s|\n!\[|\n¿|\n[A-D]\)\s/);
        if (nextBoundary > 0) {
          const trailingText = textAfter.slice(0, nextBoundary).trim();
          // Only absorb if the trailing text is short (< 300 chars) — it's just
          // form labels / captions that Mathpix OCR'd from inside the image
          if (trailingText.length > 0 && trailingText.length < 300) {
            rangeEnd += nextBoundary;
            console.log(`  🧩 Absorbed ${trailingText.length} chars of orphan OCR text after composite merge`);
          }
        }

        allReplacements.push({
          startChar: rangeStart,
          endChar: rangeEnd,
          newText: `![](${mergedUrl})`,
        });

        console.log(`  🧩 Merged ${groupCrops.length} crops on page ${page} → single ${merged.width}x${merged.height} image`);
      }
    } catch (err) {
      console.warn(`  ⚠️ Composite analysis failed for page ${page}: ${(err as Error).message} — keeping original crops`);
    }
  });

  await Promise.all(analysisPromises);

  if (allReplacements.length === 0) {
    console.log('  🧩 No composite figures detected — text unchanged');
    return mmdText;
  }

  // Apply replacements bottom-to-top (highest charIndex first) to preserve indices
  allReplacements.sort((a, b) => b.startChar - a.startChar);

  let result = mmdText;
  for (const rep of allReplacements) {
    result = result.slice(0, rep.startChar) + rep.newText + result.slice(rep.endChar);
  }

  console.log(`  🧩 Applied ${allReplacements.length} composite merges`);
  return result;
}

/**
 * Analyze a PDF using Mathpix for OCR (Phase 1) + gpt-4o-mini for structuring (Phase 2).
 * Mathpix is specialized in math OCR — produces perfect LaTeX for exponents, fractions, roots.
 * @param pdfBuffer - Full PDF as Buffer
 * @param onProgress - Optional callback for progress updates
 * @returns Array of structured questions
 */
export async function analyzeDocumentMathpix(
  pdfBuffer: Buffer,
  onProgress?: ProgressCallback,
  testId?: string
) {
  // Phase 1: Mathpix OCR — whole PDF at once
  onProgress?.({
    type: 'progress',
    batch: 1,
    totalBatches: 4,
    pages: 'all',
    questionsFound: 0,
    message: 'Enviando PDF a Mathpix OCR...',
  });

  const { text: rawText, pdfId: mathpixPdfId } = await ocrFullPdfMathpix(pdfBuffer);
  let fullText = rawText;

  // DEBUG: Dump raw .mmd
  const debugDir = path.resolve(__dirname, '../../debug-mmd');
  try { fs.mkdirSync(debugDir, { recursive: true }); } catch {}
  fs.writeFileSync(path.join(debugDir, '01-raw-ocr.mmd'), fullText, 'utf-8');
  console.log(`  📝 DEBUG: Saved raw OCR to debug-mmd/01-raw-ocr.mmd`);

  // Phase 1.25: Normalize \begin{figure} LaTeX blocks → ![caption](URL) markdown
  fullText = normalizeMathpixFigures(fullText);

  // DEBUG: Dump after Phase 1.25
  fs.writeFileSync(path.join(debugDir, '02-after-normalize.mmd'), fullText, 'utf-8');
  console.log(`  📝 DEBUG: Saved normalized to debug-mmd/02-after-normalize.mmd`);

  // Phase 1.3: Detect and merge composite figures (before re-hosting, while CDN URLs are active)
  try {
    onProgress?.({
      type: 'progress',
      batch: 1,
      totalBatches: 5,
      pages: 'all',
      questionsFound: 0,
      message: 'Detectando figuras compuestas...',
    });
    fullText = await mergeCompositeFigures(fullText);
  } catch (err) {
    console.warn(`  ⚠️ Phase 1.3 (composite merging) failed: ${(err as Error).message} — continuing with original text`);
  }

  // DEBUG: Dump after Phase 1.3
  fs.writeFileSync(path.join(debugDir, '03-after-composite-merge.mmd'), fullText, 'utf-8');
  console.log(`  📝 DEBUG: Saved after composite merge to debug-mmd/03-after-composite-merge.mmd`);

  // Phase 1.5: Extract images from Mathpix CDN and re-host to Supabase
  if (testId) {
    onProgress?.({
      type: 'progress',
      batch: 2,
      totalBatches: 5,
      pages: 'all',
      questionsFound: 0,
      message: 'Re-hosteando imágenes del PDF...',
    });
    fullText = await extractAndRehostImages(fullText, testId);

    // Phase 1.6: Convert LaTeX tables to images
    onProgress?.({
      type: 'progress',
      batch: 3,
      totalBatches: 5,
      pages: 'all',
      questionsFound: 0,
      message: 'Convirtiendo tablas a imágenes...',
    });
    fullText = await convertTablesToImages(fullText, testId);
  }

  // Phase 1.7: Clean structural LaTeX before Phase 2
  // Remove \section*{} wrappers so Phase 2 sees cleaner text
  fullText = fullText.replace(/\\(?:sub)*section\*?\{([^}]*)\}/g, '$1');
  // Remove page footer markers "- N -" added by include_page_info (buildPageMapFromOcr uses rawText)
  fullText = fullText.replace(/^-\s*\d+\s*-$/gm, '');

  // DEBUG: dump final text before splitting
  try {
    fs.writeFileSync(path.join(debugDir, '04-final-before-split.mmd'), fullText, 'utf-8');
    console.log(`  📝 DEBUG: Saved final text to debug-mmd/04-final-before-split.mmd`);
  } catch {}

  // Split text into chunks for Phase 2
  const textChunks = splitMathpixTextIntoChunks(fullText, 120);
  console.log(`📄 Mathpix text split into ${textChunks.length} chunks for structuring`);

  // DEBUG: dump individual chunks
  try {
    textChunks.forEach((c, i) => {
      fs.writeFileSync(path.join(debugDir, `chunk-${i+1}.txt`), c, 'utf-8');
      console.log(`  📝 DEBUG: chunk-${i+1}.txt: ${c.split('\n').length} lines, ${c.length} chars`);
    });
  } catch {}

  // Phase 2: Structure each text chunk with gpt-4o-mini (sequentially to avoid OpenAI rate issues)
  const allQuestions: any[] = [];

  for (let i = 0; i < textChunks.length; i++) {
    const chunk = textChunks[i];
    const chunkInfo = `texto chunk ${i + 1} de ${textChunks.length}`;
    console.log(`  🔄 Structure ${i + 1}/${textChunks.length}...`);

    let questions: any[] | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        questions = await structureTranscription(chunk, chunkInfo);
        console.log(`  ✅ Structure ${i + 1}${attempt > 0 ? ` (retry ${attempt})` : ''}: ${questions.length} preguntas`);
        break;
      } catch (err) {
        console.warn(`  ⚠️ Structure ${i + 1} attempt ${attempt + 1} failed: ${(err as Error).message}`);
        if (attempt === 2) {
          console.error(`  ❌ Structure ${i + 1} failed after 3 attempts — skipping chunk`);
        }
      }
    }
    if (questions) allQuestions.push(...questions);

    onProgress?.({
      type: 'progress',
      batch: i + 2,
      totalBatches: textChunks.length + 1,
      pages: `chunk ${i + 1}`,
      questionsFound: allQuestions.length,
      message: `Estructurando preguntas (chunk ${i + 1} de ${textChunks.length})...`,
    });
  }

  // Phase 3: Detect "missing figures" — questions that reference a figure but have no image
  // When Mathpix OCR extracts a styled visual element (poster, cartel) as text,
  // it may lose data. We detect this and crop the relevant PDF page as an image.
  if (testId && mathpixPdfId) {
    const missingFigurePatterns = /\b(?:en la figura|la figura adjunta|el cartel|la imagen adjunta|en el gráfico adjunto)\b/i;
    const questionsWithMissingFigures = allQuestions.filter(
      (q: any) => !q.has_image && !q.image_url &&
        (missingFigurePatterns.test(q.context || '') || missingFigurePatterns.test(q.text || ''))
    );

    if (questionsWithMissingFigures.length > 0) {
      console.log(`  🔍 Phase 3: Found ${questionsWithMissingFigures.length} questions with missing figures`);

      // Build page map from raw OCR text: find page footer markers like "- N -"
      const pageMap = buildPageMapFromOcr(rawText);

      for (const q of questionsWithMissingFigures) {
        try {
          const qNum = parseInt(q.number, 10);
          const pageNum = pageMap.get(qNum);
          if (!pageNum) {
            console.log(`    ⚠️ Q${q.number}: could not determine page number, skipping`);
            continue;
          }

          // Crop the middle portion of the page (where figures usually appear)
          const pagePadded = String(pageNum).padStart(2, '0');
          const cropUrl = `https://cdn.mathpix.com/cropped/${mathpixPdfId}-${pagePadded}.jpg?height=1200&width=1200&top_left_y=400&top_left_x=250`;

          const cropRes = await fetch(cropUrl, { headers: getMathpixHeaders() });
          if (!cropRes.ok) {
            console.log(`    ⚠️ Q${q.number}: crop failed (${cropRes.status}), skipping`);
            continue;
          }

          const cropBuffer = Buffer.from(await cropRes.arrayBuffer());
          const hash = crypto.createHash('md5').update(cropUrl).digest('hex').slice(0, 12);
          const imagePath = `img_${testId}_fig_${hash}`;
          const imageUrl = await uploadImage(cropBuffer, imagePath, 'image/jpeg');

          q.has_image = true;
          q.image_url = imageUrl;
          q.image_description = q.image_description || '[Figura extraída automáticamente de la página del PDF]';
          // Prepend image to context so it shows in the editor
          if (q.context) {
            q.context = `![](${imageUrl})\n\n${q.context}`;
          } else {
            q.context = `![](${imageUrl})`;
          }
          console.log(`    ✅ Q${q.number}: extracted figure from page ${pageNum} → ${imageUrl}`);
        } catch (err) {
          console.warn(`    ⚠️ Q${q.number}: figure extraction failed: ${(err as Error).message}`);
        }
      }
    }
  }

  console.log(`📄 Total: ${allQuestions.length} preguntas extraídas (Mathpix + ${textChunks.length} structure calls)`);
  return allQuestions;
}

/**
 * Analizar contenido de archivo Excel/CSV y extraer estudiantes
 * @param content - Contenido del archivo como texto
 * @returns Array de estudiantes con nombre y email
 */
export async function extractStudentsFromFile(content: string) {
  const prompt = `Analiza este contenido de archivo Excel/CSV y extrae la lista de estudiantes.
Busca nombres completos de personas y emails (si existen).

REGLAS IMPORTANTES:
1. Extrae TODOS los nombres de personas que encuentres
2. Ignora encabezados como "Nombre", "Estudiante", "Email", "N°", etc.
3. Ignora números de lista al inicio de filas (1, 2, 3...)
4. Solo omite un nombre si está EXPLÍCITAMENTE tachado (con ~~texto~~ o caracteres de tachado)
5. NO omitas nombres solo porque están cerca de otros tachados
6. Cada nombre debe evaluarse INDIVIDUALMENTE - si no tiene marcas de tachado, INCLÚYELO
7. En caso de duda, INCLUYE el nombre (es mejor incluir de más que omitir)

Responde SOLO con JSON válido en este formato:
{
  "students": [
    { "name": "Nombre Completo", "email": "email@ejemplo.com" },
    { "name": "Otro Nombre", "email": null }
  ]
}

Contenido del archivo:
${content}`;

  const completion = await openai.chat.completions.create({
    model: env.OPENAI_MODEL,
    messages: [
      {
        role: 'system',
        content: 'Eres un experto en procesamiento de datos. Extraes nombres de estudiantes de archivos de lista. Respondes solo en formato JSON válido.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    temperature: 0.1, // Muy baja para resultados consistentes
    response_format: { type: 'json_object' },
  });

  const responseText = completion.choices[0].message.content || '{}';
  const parsed = JSON.parse(responseText);

  return parsed.students || [];
}

/**
 * Corregir respuesta de desarrollo o matemática con IA
 * @param params - Parámetros de corrección
 * @returns Puntaje y feedback
 */
export async function correctWithAI(params: {
  questionType: 'DEVELOPMENT' | 'MATH';
  questionText: string;
  correctionCriteria: string;
  maxPoints: number;
  studentAnswer: string;
}): Promise<{ pointsEarned: number; feedback: string }> {
  const { questionType, questionText, correctionCriteria, maxPoints, studentAnswer } = params;

  // Para MATH: solo comparar resultado, NO pedir procedimiento
  const typeDescription = questionType === 'MATH'
    ? 'Esta es una pregunta de MATEMÁTICAS. Solo compara el RESULTADO FINAL con la pauta. NO evalúes procedimiento.'
    : 'Esta es una pregunta de DESARROLLO. Evalúa la comprensión conceptual, claridad de expresión y uso correcto de términos.';

  const mathInstructions = questionType === 'MATH'
    ? `
REGLAS PARA MATEMÁTICAS:
- SOLO compara el resultado numérico/expresión del estudiante con la pauta
- Si el resultado coincide (mismo valor): puntaje completo
- Si no coincide: 0 puntos
- NUNCA pidas "desarrollo", "procedimiento" o "demostración"
- El feedback solo dice si es correcto o incorrecto`
    : '';

  const prompt = `Eres un profesor evaluando la respuesta de un estudiante.

${typeDescription}

PREGUNTA:
${questionText}

PAUTA DE CORRECCIÓN (respuesta esperada):
${correctionCriteria || 'No se proporcionó pauta específica.'}

PUNTAJE MÁXIMO: ${maxPoints} puntos

RESPUESTA DEL ESTUDIANTE:
${studentAnswer}
${mathInstructions}

Responde SOLO con JSON:
{
  "pointsEarned": <número entre 0 y ${maxPoints}>,
  "feedback": "<feedback breve>"
}`;

  // DEBUG: Log completo ANTES de llamar a la IA
  console.log('\n========== DEBUG correctWithAI ==========');
  console.log('Modelo:', env.OPENAI_MODEL);
  console.log('Tipo:', questionType);
  console.log('Pregunta:', questionText);
  console.log('Pauta (correctionCriteria):', correctionCriteria);
  console.log('Respuesta estudiante:', studentAnswer);
  console.log('Puntaje máximo:', maxPoints);
  console.log('--- PROMPT COMPLETO ---');
  console.log(prompt);
  console.log('--- FIN PROMPT ---');

  const completion = await openai.chat.completions.create({
    model: env.OPENAI_MODEL,
    messages: [
      {
        role: 'system',
        content: 'Eres un profesor experto en evaluación educativa. Corriges respuestas de manera justa. Respondes solo en formato JSON válido.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    temperature: 0.3,
    response_format: { type: 'json_object' },
  });

  const responseText = completion.choices[0]?.message.content || '{}';

  // DEBUG: Log de la respuesta de la IA
  console.log('--- RESPUESTA IA ---');
  console.log(responseText);
  console.log('========== FIN DEBUG correctWithAI ==========\n');

  const parsed = JSON.parse(responseText);

  return {
    pointsEarned: typeof parsed.pointsEarned === 'number' ? parsed.pointsEarned : 0,
    feedback: parsed.feedback || 'No se pudo generar feedback.',
  };
}

/**
 * Corregir pregunta V/F con justificación de respuestas falsas
 * @param params - Parámetros de corrección
 * @returns Puntaje y feedback
 */
export async function correctTrueFalseWithJustification(params: {
  questionText: string;
  correctAnswer: string;
  studentAnswer: string;
  justification: string | null;
  correctionCriteria: string | null;
  maxPoints: number;
  penaltyPercentage: number;
}): Promise<{ pointsEarned: number; feedback: string }> {
  const { questionText, correctAnswer, studentAnswer, justification, correctionCriteria, maxPoints, penaltyPercentage } = params;

  const prompt = `¿La justificación del estudiante dice lo mismo que la pauta?

PAUTA: ${correctionCriteria || 'Explicar por qué es falso'}
ESTUDIANTE: ${justification || '(vacío)'}

REGLA SIMPLE:
- Si el estudiante dice lo mismo que la pauta (aunque con otras palabras) → ${maxPoints} puntos
- Si el estudiante NO dice lo que pide la pauta o está vacío → ${Math.round(maxPoints * (1 - penaltyPercentage) * 100) / 100} puntos

PROHIBIDO:
- NO agregues requisitos que no están en la pauta
- NO pidas más detalle del que tiene la pauta
- Si la pauta dice "la respuesta es 4" y el estudiante dice "la respuesta es 4", es CORRECTO (${maxPoints} pts)

JSON: { "pointsEarned": <número>, "feedback": "<máximo 10 palabras>" }`;

  // DEBUG: Log completo ANTES de llamar a la IA
  console.log('\n========== DEBUG V/F Justification ==========');
  console.log('Modelo:', env.OPENAI_MODEL);
  console.log('Pregunta:', questionText);
  console.log('Respuesta correcta:', correctAnswer);
  console.log('Respuesta estudiante:', studentAnswer);
  console.log('Pauta (correctionCriteria):', correctionCriteria);
  console.log('Justificación estudiante:', justification);
  console.log('Puntaje máximo:', maxPoints);
  console.log('Penalización:', penaltyPercentage);
  console.log('--- PROMPT COMPLETO ---');
  console.log(prompt);
  console.log('--- FIN PROMPT ---');

  const completion = await openai.chat.completions.create({
    model: env.OPENAI_MODEL,
    messages: [
      {
        role: 'system',
        content: 'Eres un profesor evaluando respuestas de Verdadero/Falso con justificación. Respondes solo en formato JSON válido.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    temperature: 0.3,
    response_format: { type: 'json_object' },
  });

  const responseText = completion.choices[0]?.message.content || '{}';

  // DEBUG: Log de la respuesta de la IA
  console.log('--- RESPUESTA IA ---');
  console.log(responseText);
  console.log('========== FIN DEBUG V/F ==========\n');

  const parsed = JSON.parse(responseText);

  return {
    pointsEarned: typeof parsed.pointsEarned === 'number' ? parsed.pointsEarned : 0,
    feedback: parsed.feedback || 'No se pudo generar feedback.',
  };
}

/**
 * Corregir pregunta de matemáticas con evaluación de unidades
 * @param params - Parámetros de corrección
 * @returns Puntaje y feedback
 */
export async function correctMathWithUnits(params: {
  questionText: string;
  correctionCriteria: string;
  maxPoints: number;
  studentAnswer: string;
  requireUnits: boolean;
  unitPenalty: number;
}): Promise<{ pointsEarned: number; feedback: string }> {
  const { questionText, correctionCriteria, maxPoints, studentAnswer, requireUnits, unitPenalty } = params;

  const unitsInstruction = requireUnits
    ? `
EVALUACIÓN DE UNIDADES: ACTIVADA
PENALIZACIÓN SI FALTA O ESTÁ INCORRECTA: ${unitPenalty * 100}%

Debes evaluar si la respuesta incluye las unidades correctas.
- Infiere la unidad esperada del contexto de la pregunta y la pauta
- Si las unidades faltan o son incorrectas, aplica la penalización al puntaje
- SIEMPRE menciona en el feedback si las unidades están correctas, faltan, o son incorrectas, y cuáles deberían ser`
    : '';

  const prompt = `Compara el RESULTADO del estudiante con la RESPUESTA CORRECTA.

RESPUESTA CORRECTA: ${correctionCriteria || 'No especificada'}
RESPUESTA DEL ESTUDIANTE: ${studentAnswer}
${unitsInstruction}

EVALUACIÓN:
- Si el resultado COINCIDE (mismo valor numérico): ${maxPoints} puntos
- Si el resultado NO COINCIDE: 0 puntos

IMPORTANTE - REGLAS ESTRICTAS:
- Solo compara RESULTADOS, NO pidas desarrollo ni procedimiento
- La respuesta puede estar en LaTeX (\\frac{1}{2} = 0.5 = 1/2)
- Formatos equivalentes son correctos (1/2 = 0.5 = 0,5)
- NUNCA menciones "desarrollo", "procedimiento" o "demostración" en el feedback
- El feedback solo debe decir si es correcto o incorrecto y mostrar la respuesta esperada

Responde SOLO JSON:
{ "pointsEarned": 0 o ${maxPoints}, "feedback": "Correcto" o "Incorrecto. Respuesta esperada: X" }`;

  // DEBUG: Log completo ANTES de llamar a la IA
  console.log('\n========== DEBUG MATH with Units ==========');
  console.log('Modelo:', env.OPENAI_MODEL);
  console.log('Pregunta:', questionText);
  console.log('Pauta (correctionCriteria):', correctionCriteria);
  console.log('Respuesta estudiante:', studentAnswer);
  console.log('Requiere unidades:', requireUnits);
  console.log('Puntaje máximo:', maxPoints);
  console.log('--- PROMPT COMPLETO ---');
  console.log(prompt);
  console.log('--- FIN PROMPT ---');

  const completion = await openai.chat.completions.create({
    model: env.OPENAI_MODEL,
    messages: [
      {
        role: 'system',
        content: 'Eres un profesor experto en matemáticas. Corriges respuestas de manera justa y pedagógica. Respondes solo en formato JSON válido.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    temperature: 0.3,
    response_format: { type: 'json_object' },
  });

  const responseText = completion.choices[0]?.message.content || '{}';

  // DEBUG: Log de la respuesta de la IA
  console.log('--- RESPUESTA IA ---');
  console.log(responseText);
  console.log('========== FIN DEBUG MATH ==========\n');

  const parsed = JSON.parse(responseText);

  return {
    pointsEarned: typeof parsed.pointsEarned === 'number' ? parsed.pointsEarned : 0,
    feedback: parsed.feedback || 'No se pudo generar feedback.',
  };
}

/**
 * Evaluar ortografía y redacción de todas las respuestas de desarrollo de un estudiante
 * Se llama UNA vez por estudiante, no por pregunta
 * @param params - Parámetros de evaluación
 * @returns Niveles de ortografía y redacción con feedback
 */
export async function evaluateSpellingAndWriting(params: {
  answers: Array<{ questionText: string; answer: string }>;
  evaluateSpelling: boolean;
  evaluateWriting: boolean;
}): Promise<{
  spellingLevel: number | null;
  writingLevel: number | null;
  feedback: string;
}> {
  const { answers, evaluateSpelling, evaluateWriting } = params;

  if (!evaluateSpelling && !evaluateWriting) {
    return { spellingLevel: null, writingLevel: null, feedback: '' };
  }

  const answersText = answers
    .map((a, i) => `---\nPregunta ${i + 1}: ${a.questionText}\nRespuesta: ${a.answer}\n---`)
    .join('\n');

  const prompt = `Eres un evaluador de ortografía y redacción. Evalúa TODAS las respuestas de desarrollo de este estudiante en conjunto.

RESPUESTAS DEL ESTUDIANTE:
${answersText}

EVALUAR ORTOGRAFÍA: ${evaluateSpelling ? 'SÍ' : 'NO'}
EVALUAR REDACCIÓN: ${evaluateWriting ? 'SÍ' : 'NO'}

CRITERIOS DE EVALUACIÓN:
- Excelente (100%): Sin errores o errores mínimos que no afectan la lectura
- Competente (75%): Pocos errores, no afectan comprensión
- En desarrollo (50%): Varios errores que distraen al lector
- Insuficiente (25%): Errores frecuentes que dificultan la comprensión
- Muy deficiente (0%): Errores graves que impiden entender el texto

INSTRUCCIONES:
1. Evalúa el conjunto de respuestas, no cada una por separado
2. Asigna un nivel (0, 25, 50, 75, o 100)
3. El feedback DEBE ser específico:
   - Citar errores exactos encontrados
   - Mostrar la corrección para cada error
   - Dar ejemplos concretos de cómo mejorar la redacción
   - Mencionar en qué pregunta está cada error

EJEMPLO DE FEEDBACK ESPECÍFICO:
"Errores de ortografía: «atravez» → «a través» (pregunta 2), «enserio» → «en serio» (pregunta 4).
Redacción: En la pregunta 2, la oración «El movimiento que fue causado por la fuerza que se aplicó» es redundante; mejor: «El movimiento fue causado por la fuerza aplicada». Evita oraciones de más de 30 palabras."

IMPORTANTE: No incluyas frases motivacionales genéricas al final del feedback como "¡Sigue así!", "¡Buen intento!", "¡Ánimo!". Termina el feedback con información útil y específica.

Responde SOLO con JSON:
{
  "spellingLevel": ${evaluateSpelling ? '<0|25|50|75|100>' : 'null'},
  "writingLevel": ${evaluateWriting ? '<0|25|50|75|100>' : 'null'},
  "feedback": "<texto específico con ejemplos>"
}`;

  const completion = await openai.chat.completions.create({
    model: env.OPENAI_MODEL,
    messages: [
      {
        role: 'system',
        content: 'Eres un experto en evaluación de ortografía y redacción en español. Proporcionas feedback específico y constructivo. Respondes solo en formato JSON válido.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    temperature: 0.3,
    response_format: { type: 'json_object' },
  });

  const responseText = completion.choices[0]?.message.content || '{}';
  const parsed = JSON.parse(responseText);

  return {
    spellingLevel: typeof parsed.spellingLevel === 'number' ? parsed.spellingLevel : null,
    writingLevel: typeof parsed.writingLevel === 'number' ? parsed.writingLevel : null,
    feedback: parsed.feedback || '',
  };
}

type RubricQuestion = {
  id: string;
  question_number: number;
  question_label: string | null;
  type: string;
  question_text: string;
  points: number;
};

type RubricSuggestion = {
  question_id: string;
  question_number: string;
  correct_answer: string | null;
  correction_criteria: string | null;
  points: number | null;
  options: {
    require_justification: boolean;
    justification_criteria: string | null;
    evaluate_spelling: boolean;
    spelling_points: number;
    evaluate_writing: boolean;
    writing_points: number;
    require_units: boolean;
    unit_penalty: number;
  };
};

const RUBRIC_SYSTEM_PROMPT = `Eres un experto en análisis de pautas de corrección educativas. Mapeas respuestas correctas y criterios de evaluación a preguntas de pruebas. Respondes solo en formato JSON válido.`;

function buildRubricUserPrompt(questionsContext: any[], chunkInfo?: string): string {
  const chunkNote = chunkInfo
    ? `\n\nNOTA: Este es un fragmento de la pauta (${chunkInfo}). Solo extrae las respuestas que encuentres en ESTE fragmento. Si una pregunta no tiene respuesta en este fragmento, NO la incluyas en la respuesta.\n`
    : '';

  return `Extrae las respuestas de esta pauta de corrección PDF y mapéalas a las preguntas de la prueba.
${chunkNote}
PREGUNTAS DE LA PRUEBA:
${JSON.stringify(questionsContext, null, 2)}

INSTRUCCIONES:
Para cada pregunta, busca en la pauta la respuesta correspondiente usando el número de pregunta como referencia.

REGLA FUNDAMENTAL: Tu trabajo es COPIAR/EXTRAER la información de la pauta, NO interpretarla ni reescribirla. La pauta será usada después por otra IA para corregir respuestas de estudiantes, así que necesita el contenido textual exacto.

REGLAS POR TIPO DE PREGUNTA:

1. TRUE_FALSE:
   - "correct_answer" = "Verdadero" o "Falso" (SIEMPRE usar estas palabras completas, NUNCA "V" o "F")
   - Si la pauta dice que la afirmación es verdadera → "Verdadero"
   - Si la pauta dice que es falsa → "Falso"
   - Si la pauta indica que el estudiante debe justificar → activa "require_justification" y copia la justificación de la pauta en "justification_criteria"

2. MULTIPLE_CHOICE:
   - "correct_answer" = la letra correcta ("A", "B", "C", "D")

3. DEVELOPMENT:
   - "correct_answer" = null (no se usa para desarrollo)
   - "correction_criteria" = COPIAR TEXTUALMENTE la respuesta/pauta que da el documento. NO resumir, NO parafrasear, NO escribir criterios de evaluación genéricos. Este texto será usado después por otra IA para corregir.
   - EJEMPLO CORRECTO: Si la pauta dice "Reflexión de la luz: Es el fenómeno en el cual la luz rebota al chocar con una superficie. Ejemplo: Cuando nos vemos en un espejo."
     → correct_answer: null, correction_criteria: "Reflexión de la luz: Es el fenómeno en el cual la luz rebota al chocar con una superficie. Ejemplo: Cuando nos vemos en un espejo."
   - EJEMPLO INCORRECTO: correction_criteria: "La respuesta debe incluir la definición del fenómeno y un ejemplo claro." ← ESTO ESTÁ MAL, no inventes criterios genéricos.

4. MATH:
   - "correct_answer" = null (no se usa para matemáticas)
   - "correction_criteria" = SOLO el resultado numérico o expresión matemática. NUNCA incluir texto explicativo. Este valor será comparado directamente con la respuesta del estudiante.
   - Si la pauta tiene texto adicional junto al resultado (explicaciones, procedimientos), IGNORAR el texto y extraer SOLO el número/expresión.
   - EJEMPLO: Si la pauta dice "El resultado es 42 cm, ya que se debe sumar las dos longitudes" → correct_answer: null, correction_criteria: "42 cm"

OPCIONES AVANZADAS:
- Si la pauta menciona "ortografía" → evaluate_spelling: true, spelling_points: puntaje indicado
- Si la pauta menciona "redacción" → evaluate_writing: true, writing_points: puntaje indicado
- Si la pauta menciona "unidades" (en preguntas MATH) → require_units: true, unit_penalty: porcentaje indicado (0.5 = 50%)
- Si NO se menciona, dejar en false/0
- "points" solo se incluye si la pauta especifica un puntaje DIFERENTE al actual; si no, usar null

IMPORTANTE:
- Usa el campo "id" de cada pregunta como "question_id" en la respuesta
- Si no puedes mapear alguna pregunta en este fragmento, simplemente no la incluyas
- El campo "number" corresponde a la nomenclatura visible de la pregunta (puede ser "1", "I.a", "2.b", etc.)

Responde SOLO con JSON válido:
{
  "questions": [
    {
      "question_id": "id-de-la-pregunta",
      "question_number": "1",
      "correct_answer": "valor o null",
      "correction_criteria": "pauta o null",
      "points": null,
      "options": {
        "require_justification": false,
        "justification_criteria": null,
        "evaluate_spelling": false,
        "spelling_points": 0,
        "evaluate_writing": false,
        "writing_points": 0,
        "require_units": false,
        "unit_penalty": 0
      }
    }
  ]
}`;
}

/**
 * Analizar un chunk de pauta de corrección con IA
 */
async function analyzeRubricChunk(
  chunkBase64: string,
  questionsContext: any[],
  chunkInfo?: string
): Promise<RubricSuggestion[]> {
  const startTime = Date.now();
  const userPrompt = buildRubricUserPrompt(questionsContext, chunkInfo);

  const completion = await openai.chat.completions.create({
    model: env.OPENAI_VISION_MODEL,
    messages: [
      {
        role: 'system',
        content: RUBRIC_SYSTEM_PROMPT,
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: userPrompt,
          },
          {
            type: 'file',
            file: {
              filename: 'pauta.pdf',
              file_data: `data:application/pdf;base64,${chunkBase64}`,
            },
          },
        ],
      },
    ],
    temperature: 0.0,
    max_tokens: 16000,
    response_format: { type: 'json_object' },
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const responseText = completion.choices[0]?.message.content || '{}';
  const parsed = JSON.parse(responseText);
  const suggestions = parsed.questions || [];

  console.log(`  📝 [${elapsed}s] Rubric chunk: ${suggestions.length} mapeos encontrados`);

  return suggestions;
}

// Máximo de preguntas por llamada a la API para evitar truncamiento de output
const RUBRIC_QUESTIONS_PER_BATCH = 20;

/**
 * Analizar pauta de corrección y mapear respuestas a preguntas existentes.
 * Soporta doble batching: PDF chunks × question batches.
 * Para 65 preguntas con 1 chunk: ceil(65/20) = 4 llamadas API.
 * @param rubricChunks - Array de chunks del PDF (base64 + metadata)
 * @param questions - Preguntas existentes de la prueba
 * @param onProgress - Optional callback para reportar progreso
 * @returns Sugerencias de respuestas/criterios por pregunta
 */
export async function analyzeRubric(
  rubricChunks: Array<{ base64: string; startPage: number; endPage: number; totalPages: number }>,
  questions: RubricQuestion[],
  onProgress?: ProgressCallback
): Promise<RubricSuggestion[]> {
  const questionsContext = questions.map(q => ({
    id: q.id,
    number: q.question_label || String(q.question_number),
    type: q.type,
    text: q.question_text,
    points: q.points,
  }));

  // Dividir preguntas en batches de RUBRIC_QUESTIONS_PER_BATCH
  const questionBatches: typeof questionsContext[] = [];
  for (let i = 0; i < questionsContext.length; i += RUBRIC_QUESTIONS_PER_BATCH) {
    questionBatches.push(questionsContext.slice(i, i + RUBRIC_QUESTIONS_PER_BATCH));
  }

  const totalApiCalls = rubricChunks.length * questionBatches.length;
  console.log(`📋 Analizando pauta: ${rubricChunks[0].totalPages} páginas, ${questions.length} preguntas → ${rubricChunks.length} PDF chunks × ${questionBatches.length} question batches = ${totalApiCalls} llamadas API`);

  const allSuggestions: RubricSuggestion[] = [];
  const seenQuestionIds = new Set<string>();
  let currentCall = 0;

  for (let ci = 0; ci < rubricChunks.length; ci++) {
    const chunk = rubricChunks[ci];
    const chunkInfo = rubricChunks.length > 1
      ? `páginas ${chunk.startPage}-${chunk.endPage} de ${chunk.totalPages}`
      : undefined;

    for (let qi = 0; qi < questionBatches.length; qi++) {
      currentCall++;
      const qBatch = questionBatches[qi];
      const qStart = qi * RUBRIC_QUESTIONS_PER_BATCH + 1;
      const qEnd = qStart + qBatch.length - 1;

      const progressMsg = questionBatches.length > 1
        ? `Procesando preguntas ${qStart}-${qEnd} (batch ${currentCall} de ${totalApiCalls})...`
        : `Analizando pauta (${chunk.totalPages} páginas)...`;

      console.log(`  🔄 [${currentCall}/${totalApiCalls}] Preguntas ${qStart}-${qEnd}${chunkInfo ? `, ${chunkInfo}` : ''}...`);

      onProgress?.({
        type: 'progress',
        batch: currentCall,
        totalBatches: totalApiCalls,
        pages: chunkInfo ? `${chunk.startPage}-${chunk.endPage}` : `1-${chunk.totalPages}`,
        questionsFound: allSuggestions.length,
        message: progressMsg,
      });

      const suggestions = await analyzeRubricChunk(chunk.base64, qBatch, chunkInfo);
      console.log(`  ✅ [${currentCall}/${totalApiCalls}] ${suggestions.length} mapeos encontrados`);

      // Merge: first answer wins (avoid duplicates)
      for (const suggestion of suggestions) {
        if (!seenQuestionIds.has(suggestion.question_id) &&
            (suggestion.correct_answer !== null || suggestion.correction_criteria !== null)) {
          seenQuestionIds.add(suggestion.question_id);
          allSuggestions.push(suggestion);
        }
      }
    }
  }

  console.log(`📋 Total: ${allSuggestions.length}/${questions.length} preguntas mapeadas en ${totalApiCalls} llamadas`);
  return allSuggestions;
}

export default openai;
