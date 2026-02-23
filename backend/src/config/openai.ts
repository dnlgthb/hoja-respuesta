// Cliente de OpenAI - Para análisis de documentos con IA
import OpenAI from 'openai';
import { env } from './env';
import { postProcessQuestion, fixLatexInJsonString } from '../utils/mathPostProcess';

// Crear cliente de OpenAI con timeout generoso para PDFs grandes
const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
  timeout: 180_000, // 3 minutos por llamada
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
async function ocrFullPdfMathpix(pdfBuffer: Buffer): Promise<string> {
  const startTime = Date.now();
  console.log(`  🔢 Mathpix OCR: sending PDF (${(pdfBuffer.length / 1024 / 1024).toFixed(1)}MB)...`);

  // Step 1: Upload PDF
  const formData = new FormData();
  formData.append('file', new Blob([pdfBuffer], { type: 'application/pdf' }), 'prueba.pdf');
  formData.append('options_json', JSON.stringify({
    math_inline_delimiters: ['$', '$'],
    math_display_delimiters: ['$$', '$$'],
    rm_spaces: true,
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

  return mmdText;
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
- Si la transcripción indica [Imagen: ...], pon has_image: true y la descripción en image_description
- Si las opciones son imágenes descritas, inclúyelas como texto descriptivo

PREGUNTAS ANIDADAS/COMPUESTAS:
- Si hay un enunciado general para varias sub-preguntas, ponlo en "context" de cada sub-pregunta

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
      "image_page": null
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

  const completion = await openai.chat.completions.create({
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
  });

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
 * Analyze a PDF using Mathpix for OCR (Phase 1) + gpt-4o-mini for structuring (Phase 2).
 * Mathpix is specialized in math OCR — produces perfect LaTeX for exponents, fractions, roots.
 * @param pdfBuffer - Full PDF as Buffer
 * @param onProgress - Optional callback for progress updates
 * @returns Array of structured questions
 */
export async function analyzeDocumentMathpix(
  pdfBuffer: Buffer,
  onProgress?: ProgressCallback
) {
  // Phase 1: Mathpix OCR — whole PDF at once
  onProgress?.({
    type: 'progress',
    batch: 1,
    totalBatches: 3,
    pages: 'all',
    questionsFound: 0,
    message: 'Enviando PDF a Mathpix OCR...',
  });

  const fullText = await ocrFullPdfMathpix(pdfBuffer);

  // Split text into chunks for Phase 2
  const textChunks = splitMathpixTextIntoChunks(fullText, 120);
  console.log(`📄 Mathpix text split into ${textChunks.length} chunks for structuring`);

  // Phase 2: Structure each text chunk with gpt-4o-mini
  const CONCURRENCY = 2;
  const allQuestions: any[] = [];

  for (let i = 0; i < textChunks.length; i += CONCURRENCY) {
    const batch = textChunks.slice(i, i + CONCURRENCY);
    const batchPromises = batch.map((chunk, j) => {
      const idx = i + j;
      const chunkInfo = `texto chunk ${idx + 1} de ${textChunks.length}`;
      console.log(`  🔄 Structure ${idx + 1}/${textChunks.length}...`);
      return structureTranscription(chunk, chunkInfo).then(questions => {
        console.log(`  ✅ Structure ${idx + 1}: ${questions.length} preguntas`);
        return { idx, questions };
      });
    });

    onProgress?.({
      type: 'progress',
      batch: Math.min(i + CONCURRENCY, textChunks.length) + 1,
      totalBatches: textChunks.length + 1,
      pages: `chunk ${i + 1}-${Math.min(i + CONCURRENCY, textChunks.length)}`,
      questionsFound: allQuestions.length,
      message: `Estructurando preguntas (chunk ${i + 1}-${Math.min(i + CONCURRENCY, textChunks.length)} de ${textChunks.length})...`,
    });

    const results = await Promise.all(batchPromises);
    results.sort((a, b) => a.idx - b.idx);
    for (const r of results) {
      allQuestions.push(...r.questions);
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
