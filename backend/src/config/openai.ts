// Cliente de OpenAI - Para análisis de documentos con IA
import OpenAI from 'openai';
import { env } from './env';

// Crear cliente de OpenAI
const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
});

/**
 * Analizar texto de un PDF y extraer preguntas
 * @param pdfText - Texto extraído del PDF
 * @returns Array de preguntas estructuradas
 */
export async function analyzeDocument(pdfText: string) {
  const prompt = `Extrae las preguntas de esta prueba educativa.

REGLA MÁS IMPORTANTE - TEXTO DE LA PREGUNTA:
El campo "text" debe incluir TODA la instrucción, no solo la expresión matemática.

EJEMPLO CORRECTO para preguntas matemáticas:
Documento dice: "2. Calcula y simplifica: (3/4) + (2/8) = ___"
→ text: "Calcula y simplifica: (3/4) + (2/8)"  ← INCLUYE "Calcula y simplifica"

EJEMPLO INCORRECTO:
→ text: "(3/4) + (2/8)"  ← MAL, falta la instrucción

TIPOS DE PREGUNTA:
- TRUE_FALSE: Afirmaciones V/F
- MULTIPLE_CHOICE: Pregunta con opciones (incluir array "options")
- DEVELOPMENT: Preguntas abiertas/redacción
- MATH: Cálculos matemáticos

NOMENCLATURA:
- Usa la numeración exacta del documento: "1", "2", "I.a", "II.b", etc.

Responde SOLO JSON:
{
  "questions": [
    {
      "number": "1",
      "type": "TRUE_FALSE",
      "points": 1,
      "text": "El sol es una estrella",
      "options": null
    },
    {
      "number": "2",
      "type": "MATH",
      "points": 2,
      "text": "Calcula y simplifica: (3/4) + (2/8)",
      "options": null
    },
    {
      "number": "3",
      "type": "MATH",
      "points": 2,
      "text": "Calcula: √49 + √9",
      "options": null
    }
  ]
}

IMPORTANTE:
- El campo "text" DEBE incluir la INSTRUCCIÓN completa (ej: "Calcula y simplifica:", "Calcula:", "Resuelve:")
- NO omitas las instrucciones, solo la expresión matemática no es suficiente
- El campo "number" es STRING (permite "I.a", "2.b", etc.)
- Si hay puntaje indicado, úsalo; si no, usa 1 punto

Documento a analizar:
${pdfText}`;

  const completion = await openai.chat.completions.create({
    model: env.OPENAI_MODEL,
    messages: [
      {
        role: 'system',
        content: 'Eres un experto en análisis de pruebas educativas. Respondes solo en formato JSON válido.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    temperature: 0.3, // Baja temperatura para respuestas más consistentes
    response_format: { type: 'json_object' }, // Forzar respuesta JSON
  });

  const responseText = completion.choices[0].message.content || '{}';
  const parsed = JSON.parse(responseText);

  return parsed.questions || [];
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

/**
 * Analizar pauta de corrección y mapear respuestas a preguntas existentes
 * @param rubricText - Texto extraído del PDF de pauta
 * @param questions - Preguntas existentes de la prueba
 * @returns Sugerencias de respuestas/criterios por pregunta
 */
export async function analyzeRubric(
  rubricText: string,
  questions: Array<{
    id: string;
    question_number: number;
    question_label: string | null;
    type: string;
    question_text: string;
    points: number;
  }>
): Promise<Array<{
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
}>> {
  const questionsContext = questions.map(q => ({
    id: q.id,
    number: q.question_label || String(q.question_number),
    type: q.type,
    text: q.question_text,
    points: q.points,
  }));

  const prompt = `Eres un asistente que extrae respuestas de una pauta de corrección y las mapea a preguntas de una prueba.

PREGUNTAS DE LA PRUEBA:
${JSON.stringify(questionsContext, null, 2)}

TEXTO DE LA PAUTA DE CORRECCIÓN:
${rubricText}

INSTRUCCIONES:
Para cada pregunta, busca en la pauta la respuesta correspondiente usando el número de pregunta como referencia.

REGLA FUNDAMENTAL: Tu trabajo es COPIAR/EXTRAER la información de la pauta, NO interpretarla ni reescribirla. La pauta será usada después por otra IA para corregir respuestas de estudiantes, así que necesita el contenido textual exacto.

REGLAS POR TIPO DE PREGUNTA:

1. TRUE_FALSE:
   - "correct_answer" = "V" o "F" según lo que diga la pauta
   - Si la pauta dice que la afirmación es verdadera → "V"
   - Si la pauta dice que es falsa → "F"
   - Si la pauta indica que el estudiante debe justificar → activa "require_justification" y copia la justificación de la pauta en "justification_criteria"

2. MULTIPLE_CHOICE:
   - "correct_answer" = la letra correcta ("A", "B", "C", "D")

3. DEVELOPMENT:
   - "correct_answer" = COPIAR TEXTUALMENTE la respuesta que da la pauta. NO resumir, NO parafrasear, NO escribir criterios de evaluación genéricos.
   - "correction_criteria" = COPIAR TEXTUALMENTE los criterios o rúbrica si la pauta los incluye por separado. Si la pauta solo da la respuesta modelo, dejar null.
   - EJEMPLO CORRECTO: Si la pauta dice "Reflexión de la luz: Es el fenómeno en el cual la luz rebota al chocar con una superficie. Ejemplo: Cuando nos vemos en un espejo."
     → correct_answer: "Reflexión de la luz: Es el fenómeno en el cual la luz rebota al chocar con una superficie. Ejemplo: Cuando nos vemos en un espejo."
   - EJEMPLO INCORRECTO: "La respuesta debe incluir la definición del fenómeno y un ejemplo claro." ← ESTO ESTÁ MAL, no inventes criterios.

4. MATH:
   - "correct_answer" = SOLO el resultado numérico o expresión matemática (en LaTeX si aplica, ej: \\frac{1}{2}). NUNCA incluir texto explicativo.
   - "correction_criteria" = null (para matemáticas solo importa el resultado)
   - Si la pauta tiene texto adicional junto al resultado (explicaciones, procedimientos), IGNORAR el texto y extraer SOLO el número/expresión.
   - EJEMPLO: Si la pauta dice "El resultado es 42 cm, ya que se debe sumar las dos longitudes" → correct_answer: "42 cm", correction_criteria: null

OPCIONES AVANZADAS:
- Si la pauta menciona "ortografía" → evaluate_spelling: true, spelling_points: puntaje indicado
- Si la pauta menciona "redacción" → evaluate_writing: true, writing_points: puntaje indicado
- Si la pauta menciona "unidades" (en preguntas MATH) → require_units: true, unit_penalty: porcentaje indicado (0.5 = 50%)
- Si NO se menciona, dejar en false/0
- "points" solo se incluye si la pauta especifica un puntaje DIFERENTE al actual; si no, usar null

IMPORTANTE:
- Usa el campo "id" de cada pregunta como "question_id" en la respuesta
- Si no puedes mapear alguna pregunta, incluye "correct_answer": null y "correction_criteria": null
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

  const completion = await openai.chat.completions.create({
    model: env.OPENAI_MODEL,
    messages: [
      {
        role: 'system',
        content: 'Eres un experto en análisis de pautas de corrección educativas. Mapeas respuestas correctas y criterios de evaluación a preguntas de pruebas. Respondes solo en formato JSON válido.',
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

  return parsed.questions || [];
}

export default openai;
