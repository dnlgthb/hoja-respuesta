# Implementar: Cargar Pauta PDF para Auto-rellenar Respuestas

## Contexto

Aproba es una plataforma educativa donde profesores suben pruebas en PDF, la IA extrae las preguntas, y luego el profesor configura las respuestas correctas manualmente. Quiero agregar la opción de subir un **segundo PDF (la pauta de corrección)** para que la IA rellene automáticamente las respuestas correctas y criterios de corrección de cada pregunta.

Lee los archivos de contexto del proyecto antes de empezar:
- `project_context/ARQUITECTURA.md` — estructura de carpetas, modelos, endpoints, flujos
- `project_context/DECISIONES_TECNICAS.md` — stack, convenciones, decisiones
- `project_context/ROADMAP.md` — estado actual del proyecto

## Qué construir

### Flujo esperado

1. El profesor ya tiene una prueba con preguntas extraídas (página `/tests/[id]`)
2. En el editor de preguntas, hay un botón **"Cargar pauta"** visible
3. Al hacer clic, se abre un modal/diálogo para subir un archivo PDF
4. El PDF se sube a Supabase Storage (bucket `test-pdfs`, con prefijo `rubrics/`)
5. Se extrae el texto del PDF con `pdfjs-dist` (igual que el PDF de la prueba)
6. Se envía a GPT-4o-mini junto con las preguntas ya existentes de la prueba
7. La IA mapea la pauta a cada pregunta y retorna las respuestas/criterios
8. Se muestra un **preview** de lo que la IA quiere rellenar, para que el profesor confirme o edite
9. Al confirmar, se actualizan las preguntas en la base de datos
10. La URL del PDF de pauta se guarda en el campo `rubric_pdf_url` del Test

### Backend

#### Modelo de datos
- Agregar campo `rubric_pdf_url` (String, opcional) al modelo `Test` en `schema.prisma`
- Ejecutar migración de Prisma

#### Nuevo endpoint
- `POST /api/tests/:id/analyze-rubric` (requiere JWT)
  - Recibe el PDF como multipart/form-data (reutilizar config de multer existente)
  - Sube el PDF a Supabase Storage en `rubrics/{testId}_{timestamp}.pdf`
  - Extrae texto con `pdfExtractor.ts`
  - Obtiene las preguntas actuales de la prueba desde la BD
  - Envía a OpenAI el texto de la pauta + las preguntas existentes (número, tipo, texto)
  - Retorna el JSON con los campos sugeridos para cada pregunta
  - Guarda `rubric_pdf_url` en el Test

#### NO crear endpoint de aplicación separado
- El frontend envía los datos confirmados usando los endpoints existentes de `PUT /:id/questions/:questionId` (uno por pregunta, o crear un endpoint batch si no existe)

#### Prompt de OpenAI
El prompt debe:
- Recibir como contexto la lista de preguntas ya extraídas (con su `id`, `question_number`, `question_text`, `type`, `points`)
- Recibir el texto extraído de la pauta PDF
- Mapear cada respuesta/criterio de la pauta a la pregunta correspondiente usando el número de pregunta
- Para cada pregunta, retornar un JSON con los campos que correspondan según el tipo:

```json
{
  "questions": [
    {
      "question_id": "uuid-de-la-pregunta",
      "question_number": "1",
      "correct_answer": "valor según tipo",
      "correction_criteria": "pauta detallada (solo desarrollo/math)",
      "points": 5,
      "options": {
        "require_justification": true,
        "justification_criteria": "Debe mencionar X porque Y",
        "evaluate_spelling": false,
        "spelling_points": 0,
        "evaluate_writing": false,
        "writing_points": 0,
        "require_units": false,
        "unit_penalty": 0
      }
    }
  ]
}
```

Reglas por tipo de pregunta:
- **TRUE_FALSE**: `correct_answer` = "V" o "F". Si la pauta indica que debe justificar cuando es Falso, activar `require_justification` y llenar `justification_criteria`
- **MULTIPLE_CHOICE**: `correct_answer` = la letra correcta ("A", "B", "C", "D")
- **DEVELOPMENT**: `correct_answer` = respuesta modelo, `correction_criteria` = pauta detallada de evaluación
- **MATH**: `correct_answer` = resultado esperado (en LaTeX si aplica), `correction_criteria` = procedimiento esperado paso a paso

Para las opciones avanzadas, la IA debe inferir del texto de la pauta:
- Si menciona "ortografía", "redacción", "unidades", etc., activar las opciones correspondientes
- Si no se menciona, dejar desactivadas (valores por defecto: false/0)
- `points` solo se actualiza si la pauta especifica un puntaje diferente al actual

El prompt debe ser en español (las pautas estarán en español).

### Frontend

#### Botón "Cargar pauta"
- Ubicación: en la página `/tests/[id]` (editor de preguntas), parte superior, junto a los controles existentes
- Icono sugerido: `FileUp` o `ClipboardCheck` de lucide-react
- Solo visible cuando la prueba tiene preguntas (status DRAFT o ACTIVE)
- Al hacer clic, abre un modal

#### Modal de carga
- Zona de drag & drop o botón para seleccionar PDF (similar al upload de prueba)
- Límite: 10MB, solo PDF
- Al subir: muestra spinner con texto "Analizando pauta..."
- Si hay error: mostrar mensaje claro

#### Preview de resultados
- Después del análisis, mostrar un modal/panel con la lista de preguntas
- Para cada pregunta mostrar:
  - Número y texto de la pregunta (referencia, no editable aquí)
  - Los campos que la IA quiere rellenar, editables antes de confirmar
  - Indicador visual si la IA no pudo mapear alguna pregunta (ej: "No se encontró respuesta en la pauta")
- Botones: "Aplicar todo", "Cancelar"
- Al aplicar: actualizar todas las preguntas con los valores confirmados

### Consideraciones importantes

- **No romper nada existente.** Las preguntas que ya tienen respuestas configuradas manualmente deben mostrar una advertencia antes de sobrescribir ("Esta pregunta ya tiene respuesta configurada. ¿Sobrescribir?")
- Reutilizar la infraestructura existente: multer config, pdfExtractor, openai client, supabase storage client
- Seguir las convenciones del proyecto: snake_case en backend (Prisma), camelCase en frontend
- El endpoint debe validar que la prueba pertenece al profesor autenticado
- Manejar el caso donde la pauta no coincide con las preguntas (la IA no pudo mapear algunas)

## Implementación paso a paso

1. Migración de BD (agregar `rubric_pdf_url` a Test)
2. Endpoint backend `POST /api/tests/:id/analyze-rubric`
3. Prompt de OpenAI para análisis de pauta
4. Endpoint batch para actualizar múltiples preguntas (si no existe)
5. Frontend: botón + modal de carga
6. Frontend: preview de resultados con edición
7. Frontend: aplicar cambios
8. Probar flujo completo

Confirma cada paso antes de avanzar al siguiente.
