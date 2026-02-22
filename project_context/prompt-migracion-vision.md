# Migración de extracción de PDF: texto → visión (GPT-4o-mini)

## Contexto

Actualmente el endpoint `POST /api/tests/:id/analyze-pdf` extrae texto del PDF con `pdfjs-dist` y lo envía a GPT-4o-mini como texto plano. Esto falla con:
- Expresiones matemáticas (fracciones, raíces, exponentes, símbolos griegos) que aparecen como cuadrados o caracteres rotos
- Imágenes/diagramas/gráficos dentro de las preguntas que se pierden completamente
- Preguntas anidadas (ej: pregunta 1 con sub-preguntas 1.a, 1.b) donde se pierde el enunciado padre

El mismo problema afecta al análisis de pautas de corrección (`analyzeRubric`), que también usa `extractTextFromPDF`.

## Objetivo

Reemplazar la extracción de texto con `pdfjs-dist` por envío directo del PDF a GPT-4o-mini, aprovechando que la API de OpenAI soporta PDFs como input nativo (el modelo convierte cada página a imagen internamente). Esto aplica tanto para el análisis de pruebas como para el análisis de pautas de corrección.

## Enfoque: PDF directo (sin librería de conversión)

**Decisión clave:** En lugar de instalar librerías como `pdf-to-img` o `pdf2pic` para convertir PDF→imágenes, se usa el soporte nativo de OpenAI para archivos PDF. Esto:
- Elimina dependencias nativas problemáticas (canvas, GraphicsMagick)
- Simplifica enormemente el código
- Evita problemas de compatibilidad en Railway
- El modelo "ve" las páginas exactamente como un humano

El formato para enviar un PDF directamente a la API es:
```typescript
{
  type: "file",
  file: {
    filename: "documento.pdf",
    file_data: `data:application/pdf;base64,${pdfBase64}`
  }
}
```

## Cambios requeridos

### 1. Modificar `backend/src/utils/pdfExtractor.ts`

Reemplazar la función actual de extracción de texto. La nueva función debe:
- Recibir el buffer del PDF
- Convertir a base64
- Retornar el string base64 del PDF completo

```typescript
export function convertPdfToBase64(pdfBuffer: Buffer): string {
  return pdfBuffer.toString('base64');
}
```

Mantener la función vieja `extractTextFromPDF` comentada como fallback.

### 2. Modificar `backend/src/config/openai.ts` - función `analyzeDocument`

Reemplazar la función actual que recibe texto plano por una que envíe el PDF directo:

```typescript
export async function analyzeDocument(pdfBase64: string) {
  const response = await openai.chat.completions.create({
    model: env.OPENAI_MODEL,
    messages: [
      {
        role: "system",
        content: PROMPT_SISTEMA_VISION // ver sección 4
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Analiza este PDF de una prueba educativa y extrae todas las preguntas."
          },
          {
            type: "file",
            file: {
              filename: "prueba.pdf",
              file_data: `data:application/pdf;base64,${pdfBase64}`
            }
          }
        ]
      }
    ],
    max_tokens: 16000,
    temperature: 0.3,
    response_format: { type: "json_object" }
  });

  const responseText = response.choices[0].message.content || '{}';
  const parsed = JSON.parse(responseText);
  return parsed.questions || [];
}
```

**Importante sobre límites:** GPT-4o-mini soporta hasta 128K tokens de contexto. Si el PDF tiene muchas páginas (>20), considerar dividir en batches.

### 3. Modificar el servicio de análisis en `backend/src/modules/tests/tests.service.ts`

#### 3a. Función `analyzePDF`:

**Antes:**
```
1. Descargar PDF de Supabase
2. Extraer texto con pdfjs-dist
3. Enviar texto a GPT-4o-mini
4. Parsear respuesta JSON
5. Crear Questions en BD
```

**Después:**
```
1. Recibir PDF buffer
2. Convertir a base64
3. Enviar PDF directo a GPT-4o-mini
4. Parsear respuesta JSON (con campos nuevos: context, has_image, etc.)
5. Crear Questions en BD (incluyendo campos nuevos)
```

#### 3b. Función `analyzeRubric` (NUEVO - también debe migrar):

La función `analyzeRubric` en `tests.service.ts` también usa `extractTextFromPDF` para la pauta de corrección. Las pautas con fórmulas matemáticas tienen el mismo problema de extracción rota. Migrar al mismo enfoque de PDF directo.

**Antes:**
```
1. Extraer texto de pauta con pdfjs-dist
2. Enviar texto a analyzeRubricAI()
```

**Después:**
```
1. Convertir pauta a base64
2. Enviar PDF directo a analyzeRubricAI() con vision
```

### 4. Prompt del sistema para extracción de preguntas

Reemplazar el prompt actual. Mantener los nombres de campos compatibles con el mapper existente (`number` y `text`), pero agregar campos nuevos:

```
Eres un asistente especializado en extraer preguntas de pruebas educativas chilenas.

INSTRUCCIONES:
1. Analiza el documento PDF y extrae TODAS las preguntas que encuentres.
2. Ignora las páginas de instrucciones, portada y páginas en blanco.
3. Para cada pregunta identifica:
   - Número de pregunta (puede ser "1", "1.a", "I", "I.a", etc.)
   - Tipo: TRUE_FALSE, MULTIPLE_CHOICE, DEVELOPMENT, o MATH
   - Texto completo del enunciado
   - Opciones (si aplica)
   - Respuesta correcta (si es posible deducirla)

REGLAS CRÍTICAS PARA EXPRESIONES MATEMÁTICAS:
- Transcribe TODAS las expresiones matemáticas usando formato LaTeX.
- Fracciones: \frac{numerador}{denominador}
- Raíces: \sqrt{x}, \sqrt[3]{x}
- Exponentes: x^{2}, x^{n}
- Subíndices: x_{1}
- Símbolos: \pi, \geq, \leq, \neq, \sim, \vec{v}
- Intervalos: [p, q], ]p, q[, [p, q[, ]p, q]

REGLAS PARA PREGUNTAS CON IMÁGENES/FIGURAS:
- Si una pregunta incluye una figura, diagrama, tabla o imagen, indícalo en el campo "has_image": true
- En el campo "image_description" describe brevemente qué muestra la imagen (ej: "Gráfico de parábola con vértice en (1, 40)")
- En el campo "image_page" indica el número de página donde está la imagen

REGLAS PARA PREGUNTAS ANIDADAS/COMPUESTAS:
- Si hay un enunciado general que aplica a varias sub-preguntas (ej: "Lee el siguiente texto y responde las preguntas 5 a 8"), incluye ese contexto en el campo "context" de CADA sub-pregunta.
- No omitas el enunciado padre. Cada sub-pregunta debe ser comprensible por sí sola con su campo "context".

REGLAS PARA PREGUNTAS DE OPCIÓN MÚLTIPLE:
- Las opciones deben incluir la letra (A, B, C, D) y el contenido completo.
- Si una opción contiene una expresión matemática, transcríbela en LaTeX.
- Si una opción es una imagen o gráfico, descríbelo.

REGLA MÁS IMPORTANTE - TEXTO DE LA PREGUNTA:
El campo "text" debe incluir TODA la instrucción, no solo la expresión matemática.
EJEMPLO CORRECTO: "Calcula y simplifica: \frac{3}{4} + \frac{2}{8}"
EJEMPLO INCORRECTO: "\frac{3}{4} + \frac{2}{8}" (falta la instrucción)

Responde ÚNICAMENTE con un JSON válido con esta estructura:
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
```

**Nota sobre nombres de campos:** Se mantienen `number` y `text` (en lugar de `question_number` y `question_text`) para compatibilidad con el mapper existente en `tests.service.ts` que usa `q.number` y `q.text`.

### 5. Prompt del sistema para análisis de rúbrica (vision)

Actualizar `analyzeRubric` en `openai.ts` para recibir PDF base64 en lugar de texto plano. El prompt existente ya está bien estructurado; solo cambia el método de input (de texto a PDF directo).

### 6. Manejo de imágenes asociadas a preguntas

Por ahora NO recortar ni almacenar las imágenes individualmente. Solo registrar los metadatos (`has_image`, `image_description`, `image_page`). El estudiante ya ve el PDF original al lado de la hoja de respuestas, así que las imágenes están visibles.

En el futuro se puede implementar recorte y almacenamiento en Supabase, pero no es necesario para esta iteración.

### 7. Actualizar modelo Question en Prisma (migración)

Agregar campos opcionales al modelo Question:
- `context` (String? @db.Text) - para el enunciado padre en preguntas anidadas
- `has_image` (Boolean, default false)
- `image_description` (String? @db.Text)
- `image_page` (Int?)

Ejecutar migración de Prisma para agregar estos campos.

### 8. Consideraciones de deploy en Railway

- No se requieren dependencias nativas nuevas (no canvas, no ImageMagick)
- El PDF se envía directo a OpenAI como base64, sin conversión intermedia
- Verificar que `max_tokens: 16000` es suficiente para pruebas largas
- `pdfjs-dist` se mantiene como dependencia por si se necesita fallback a texto

### 9. Testing

Probar con:
1. Un PDF simple de alternativas (sin matemáticas)
2. Un PDF de matemáticas con fórmulas complejas
3. Un PDF con preguntas anidadas (1.a, 1.b)
4. Un PDF con imágenes/diagramas
5. Una pauta de corrección con fórmulas matemáticas

Verificar que:
- Las expresiones matemáticas se transcriben correctamente en LaTeX
- Las preguntas anidadas mantienen el contexto padre
- Las preguntas con imágenes tienen has_image: true y description
- El JSON resultante es válido y compatible con la creación de Questions en BD
- La pauta de corrección se analiza correctamente con vision

## Archivos a modificar

1. `backend/src/utils/pdfExtractor.ts` - agregar función de conversión a base64, mantener la vieja comentada
2. `backend/src/config/openai.ts` - modificar `analyzeDocument` y `analyzeRubric` para usar PDF directo
3. `backend/src/modules/tests/tests.service.ts` - actualizar `analyzePDF` y `analyzeRubric` para usar base64
4. `backend/prisma/schema.prisma` - agregar campos nuevos a Question

## Lo que NO cambiar

- El flujo de upload de PDF a Supabase (funciona bien)
- La interfaz del frontend de análisis (no necesita cambios)
- La corrección con IA post-evaluación (es un flujo separado que usa correction_criteria ya guardados)
- Los endpoints de student (no se ven afectados)
- Las demás funciones de openai.ts (correctWithAI, evaluateSpellingAndWriting, etc.)
