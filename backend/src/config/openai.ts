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

export default openai;
