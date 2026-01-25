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
  const prompt = `Eres un asistente que analiza pruebas educativas.
Analiza el siguiente documento y extrae la estructura de preguntas.

Para cada pregunta, identifica:
- Número de pregunta
- Tipo: "TRUE_FALSE", "MULTIPLE_CHOICE", "DEVELOPMENT", "MATH"
- Texto de la pregunta
- Puntaje (si está indicado, si no usa 1)
- Opciones (si es múltiple opción, array de strings)

Responde ÚNICAMENTE con JSON en este formato:
{
  "questions": [
    {
      "number": 1,
      "type": "MULTIPLE_CHOICE",
      "points": 2,
      "text": "texto de la pregunta",
      "options": ["A", "B", "C", "D"]
    }
  ]
}

IMPORTANTE:
- Para preguntas Verdadero/Falso, usa type: "TRUE_FALSE"
- Para preguntas de múltiple opción, usa type: "MULTIPLE_CHOICE" e incluye options
- Para preguntas de desarrollo, usa type: "DEVELOPMENT"
- Para ejercicios matemáticos, usa type: "MATH"

Documento:
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

  const typeDescription = questionType === 'MATH'
    ? 'Esta es una pregunta de MATEMÁTICAS. Evalúa tanto el procedimiento como el resultado final. Un procedimiento correcto con error de cálculo menor puede recibir puntaje parcial.'
    : 'Esta es una pregunta de DESARROLLO. Evalúa la comprensión conceptual, claridad de expresión y uso correcto de términos.';

  const prompt = `Eres un profesor evaluando la respuesta de un estudiante. Tu rol es ser justo, pedagógico y constructivo.

${typeDescription}

PREGUNTA:
${questionText}

PAUTA DE CORRECCIÓN (criterios del profesor):
${correctionCriteria || 'No se proporcionó pauta específica. Evalúa según la correctitud y completitud de la respuesta.'}

PUNTAJE MÁXIMO: ${maxPoints} puntos

RESPUESTA DEL ESTUDIANTE:
${studentAnswer}

INSTRUCCIONES:
1. Evalúa la respuesta según la pauta de corrección
2. Asigna un puntaje de 0 a ${maxPoints} (puede ser decimal, ej: 1.5)
3. Proporciona feedback constructivo y específico
4. Si la respuesta es parcialmente correcta, explica qué faltó o qué estuvo mal
5. Sé alentador pero honesto

Responde SOLO con JSON en este formato:
{
  "pointsEarned": <número entre 0 y ${maxPoints}>,
  "feedback": "<feedback constructivo para el estudiante>"
}`;

  const completion = await openai.chat.completions.create({
    model: env.OPENAI_MODEL,
    messages: [
      {
        role: 'system',
        content: 'Eres un profesor experto en evaluación educativa. Corriges respuestas de manera justa y pedagógica. Respondes solo en formato JSON válido.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    temperature: 0.3, // Baja para consistencia
    response_format: { type: 'json_object' },
  });

  const responseText = completion.choices[0]?.message.content || '{}';
  const parsed = JSON.parse(responseText);

  return {
    pointsEarned: typeof parsed.pointsEarned === 'number' ? parsed.pointsEarned : 0,
    feedback: parsed.feedback || 'No se pudo generar feedback.',
  };
}

export default openai;
