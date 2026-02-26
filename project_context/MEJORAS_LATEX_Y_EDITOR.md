# Mejoras pendientes: LaTeX, Editor de preguntas y calidad de IA

## Estado actual (Feb 2026)

> **Nota:** Con el modelo "Hoja de Respuesta" (Feb 2026), las preguntas nuevas tienen `question_text = ''` y no usan el pipeline de extracción completa. La mayoría de los problemas documentados abajo aplican solo a tests legacy con texto extraído. El editor TipTap, RichMathText, y MathField siguen activos para backward compat y edición manual.

### Stack de renderizado matemático
- **Librería**: MathLive v0.108.2 (mathlive)
- **Componente de renderizado**: `RichMathText.tsx` — parsea texto mixto con `$...$` y convierte a HTML con `convertLatexToMarkup()`
- **CSS requerido**: `import 'mathlive/static.css'` en RichMathText — sin esto, fracciones y exponentes se ven rotos
- **Componente de edición math**: `MathField.tsx` — usa `<math-field>` web component para preguntas tipo MATH
- **Toolbar**: `MathToolbar.tsx` — barra de botones reutilizable (fracción, raíz, exponente, etc.) integrada en QuestionEditor

### Formato de datos
- La IA (GPT-4o-mini) extrae preguntas del PDF y devuelve texto con LaTeX delimitado por `$...$`
- Ejemplo: `"Calcula $\\frac{3}{4} + \\frac{2}{8}$"`
- Se almacena así en la base de datos (question_text, options, correction_criteria)

### Pipeline de protección LaTeX (backend → DB → frontend)
1. **`fixLatexInJsonString()`** (`mathPostProcess.ts`): Se aplica al JSON crudo de la IA ANTES de `JSON.parse()`. Previene que `\frac` → form-feed, `\times` → tab, etc.
2. **`postProcessQuestion()`** (`mathPostProcess.ts`): Post-procesa cada pregunta después del parse:
   - `repairBrokenLatex()`: Repara caracteres de control residuales
   - `wrapBareLatexInDollars()`: Envuelve comandos LaTeX sueltos en `$...$`
   - `convertUnicodeSegment()`: Convierte símbolos Unicode (×, ÷, ², etc.) a LaTeX
   - Separa prefijo de opciones (`A) `) antes de procesar para evitar `A$) \frac...$`
3. **`repairBrokenLatex()`** (frontend, `RichMathText.tsx`): Red de seguridad para datos ya corruptos en BD. Detecta caracteres de control (0x0C, 0x09, etc.) y los restaura a comandos LaTeX.

---

## Problema 1: Renderizado matemático (RESUELTO)

### Problema original
- Fracciones, exponentes, multiplicaciones no se renderizaban correctamente
- Se veía LaTeX crudo o símbolos rotos

### Causas encontradas y arregladas
1. **JSON.parse destruía backslashes LaTeX**: `\frac` → form-feed + "rac", `\times` → tab + "imes". Arreglado con `fixLatexInJsonString()` que double-escapa antes del parse.
2. **Faltaba CSS de MathLive**: `convertLatexToMarkup()` genera HTML con clases `ML__*` que requieren `mathlive/static.css`. Sin el CSS, fracciones se veían como números pegados y exponentes como subíndices. Arreglado con `import 'mathlive/static.css'`.
3. **Opciones sin delimitadores**: La IA a veces devuelve `A) \frac{1}{12}` sin `$`. El post-procesamiento ahora separa el prefijo `A) ` antes de envolver en `$...$`.

---

## Problema 2: Editor de preguntas demasiado complejo (RESUELTO)

### Problema original
- El profesor veía un `<textarea>` con texto LaTeX crudo: `Calcula $\frac{3}{4} + \frac{2}{8}$`
- Debajo había un preview azul ("Vista previa:") que mostraba el renderizado
- Arriba había un `MathToolbar` con botones para insertar símbolos
- El resultado era visualmente complejo: toolbar + textarea con `$$` + preview
- Con 65 preguntas (ej: PAES14), la página era interminable e ilegible

### Solución implementada: Preview-first con MathField WYSIWYG

Se implementó un patrón **preview-first** en `QuestionEditor.tsx`:

**Texto de la pregunta (actualizado a TipTap — ver Problema 6):**
- Por defecto muestra solo el `RichMathText` renderizado (fondo gris claro, clickeable)
- Botón lápiz (Pencil icon) en la esquina para alternar a modo edición
- Modo edición: **TipTap rich editor** con KaTeX math inline + imágenes
- Contexto y texto de pregunta unificados en un solo campo
- Click en fórmula renderizada → popup MathField para edición visual
- Botón check (Check icon) para volver al modo preview
- Click en el preview también abre modo edición

**Alternativas (MULTIPLE_CHOICE):**
- Por defecto muestra opciones compactas: radio + badge letra + texto renderizado via RichMathText
- Respuesta correcta resaltada en verde (bg-green-50 + border verde)
- **Radios funcionan en ambos modos** — se puede cambiar respuesta correcta sin abrir editor
- Botón lápiz para alternar a modo edición
- Modo edición: **MathField compact** (WYSIWYG) o input texto, toggle por opción con "Tx/𝑓x"
- Auto-detect: opciones con `$` inician en modo MathField
- `MathField compact` prop: tamaño reducido, borde gris, sin texto de ayuda

**Sin cambios en:**
- TRUE_FALSE: solo 2 radios, ya compactos
- DEVELOPMENT: solo textarea de criterios
- MATH: MathField ya es WYSIWYG

**Estados de control:**
- `isEditingText` (boolean, default false) — toggle para texto de pregunta (TipTap editor)
- `isEditingOptions` (boolean, default false) — toggle para alternativas
- `optionMathMode` (boolean[], auto-detect) — MathField vs input por opción
- Edit states se resetean a false cuando la pregunta se colapsa (`isExpanded = false`)

**Problema resuelto: inserción de math dentro de \text{}:**
- MathLive's `.insert()` trata LaTeX como texto literal cuando el cursor está dentro de un bloque `\text{}`
- Solución en `MathField.tsx`: `insertSymbol` manipula `.value` directamente en vez de usar `.insert()`
- Reemplaza `#0` placeholders por `\placeholder{}` para que MathLive renderice campos editables

**Line wrapping en MathField (commit e176cfe):**
- MathLive por defecto muestra todo el contenido en una sola línea horizontal (`white-space: nowrap`, `overflow: hidden`)
- Para preguntas largas, el profesor debía scrollear horizontalmente para ver el texto completo
- Solución: inyectar CSS en el shadow DOM de MathLive vía `requestAnimationFrame` después de crear el `<math-field>`
- Overrides necesarios en shadow DOM (adoptedStyleSheets de MathLive):
  - `.ML__base { width: min-content }` → `width: 100% !important` (el más crítico — sin esto, el contenedor colapsa)
  - `.ML__text { white-space: pre }` → `white-space: normal !important` (permite word wrap)
  - `.ML__latex { white-space: normal, flex: 1 1 100% }` (llena el contenedor flex padre)
  - `.ML__content / .ML__fieldcontainer { overflow: visible }` (evita clipping)

---

## Problema 2.5: Porcentajes con doble backslash (RESUELTO)

### Problema
- Texto mostraba `20\\%` en vez de `20%`
- Afectaba texto de preguntas y opciones que contenían `%`
- Causa: la IA produce `\\%` en el JSON (doble escape) que tras `JSON.parse` queda como `\\%` en vez de `\%`

### Solución (commit 2146e9c)
- Normalización `\\%` → `\%` en dos lugares:
  - **Frontend**: `RichMathText.tsx` → `preprocessLatex()` antes de renderizar (arregla datos existentes)
  - **Backend**: `mathPostProcess.ts` → `postProcessMathText()` antes de guardar (previene datos futuros)

---

## Problema 3: Calidad de extracción de la IA (RESUELTO con Mathpix)

### Problema original
- GPT-4o-mini Vision tenía errores **sistemáticos** en OCR matemático
- Ejemplo: `$(888)^2$` → `$(2^2·888)$`, exponentes y raíces mal leídos consistentemente
- Prompt changes, voting, temperature=0 no ayudaron

### Solución: Mathpix OCR (Phase 1)
- Mathpix es OCR especializado en matemáticas → LaTeX perfecto para fórmulas
- gpt-4o-mini solo estructura el texto (Phase 2), no hace OCR
- Costo: $0.005/pág (~$0.28 para PAES 56 páginas)
- Tiempo: ~10-15s OCR + ~90s structuring = ~2 min total

---

## Problema 5: Imágenes de preguntas (RESUELTO)

### Problema original
- Preguntas con gráficos/diagramas/tablas no tenían imagen visible
- Solo metadata (has_image, image_description, image_page) — sin URL real

### Solución: Mathpix CDN → Supabase Storage
- Mathpix OCR retorna `![](https://cdn.mathpix.com/cropped/...)` con coordenadas pixel-perfect
- CDN URLs expiran en ~30 días → `extractAndRehostImages()` descarga y sube a Supabase
- Upload path: `img_{testId}_{hash}` (flat, sin subfolder — evita RLS policy issues)
- Phase 2 prompt mapea `![](url)` → campo `image_url` + `has_image: true` + `image_description`
- Frontend muestra `<img>` inline en QuestionEditor (profesor) y vista prueba (estudiante)

### Archivos modificados
- `backend/prisma/schema.prisma` — campo `image_url String? @db.Text`
- `backend/src/config/openai.ts` — `extractAndRehostImages()`, prompt actualizado, `analyzeDocumentMathpix(testId)`
- `backend/src/config/storage.ts` — `uploadImage()` para Supabase
- `backend/src/modules/tests/tests.service.ts` — pasa testId, guarda image_url
- `backend/src/modules/student/student.service.ts` — incluye image_url en respuesta API (3 lugares)
- `frontend/src/types/index.ts` — campos imageUrl/image_url en Question
- `frontend/src/components/QuestionEditor.tsx` — render imagen con header + descripción
- `frontend/src/app/prueba/[attemptId]/page.tsx` — render imagen en vista estudiante

---

## Problema 6: Editor unificado TipTap (RESUELTO)

### Problema original
- QuestionEditor tenía 3 secciones separadas: contexto (textarea), imagen (upload/URL), texto de pregunta (textarea/MathField)
- Causaba bugs recurrentes: imágenes duplicadas al re-abrir, LaTeX estructural entre campos, renderizado inconsistente
- MathField no maneja bien markdown/URLs (mangles `![`, `&`, `_`), así que no podía manejar imágenes inline
- El contexto y el texto eran campos separados, pero el profesor los quiere editar como uno solo

### Solución: TipTap rich text editor unificado

**Stack:** `@tiptap/react` + `@tiptap/starter-kit` + `@tiptap/extension-mathematics` (KaTeX) + `@tiptap/extension-image` + `@tiptap/extension-placeholder`

**Archivos nuevos:**
| Archivo | Propósito |
|---------|-----------|
| `tiptap/QuestionTipTapEditor.tsx` | Editor principal con math inline (KaTeX) + imágenes |
| `tiptap/TipTapToolbar.tsx` | Toolbar: reutiliza `MATH_TOOLBAR_BUTTONS` + botón imagen |
| `tiptap/MathEditPopup.tsx` | Popup floating con MathField al click en fórmula |
| `tiptap/serializers.ts` | Conversión bidireccional texto plano ↔ TipTap HTML |
| `tiptap/tiptap-editor.css` | Estilos para KaTeX nodes, imágenes, editor |

**Cambios en QuestionEditor.tsx:**
- `mergeContextAndText()`: combina contexto + `\n\n` + texto, normalizado para TipTap
- Al guardar: `context: null` (todo en `question_text`), extrae `image_url` del texto
- Sección "Enunciado" usa `QuestionTipTapEditor` en modo edición, `RichMathText` en preview
- Eliminados: `localContext`, `isEditingContext`, `contextTextareaRef`, `textMathMode`

**Serialización (sin cambios de BD):**
- `plainTextToTipTapHtml()`: `$...$` → `<span data-type="inline-math">`, `$$...$$` → `<div data-type="block-math">`, `![](url)` → `<img>`
- `tipTapDocToPlainText()`: Reverse — escapa `$` en texto como `\$`
- `normalizeForTipTap()`: Fuerza `\n\n` alrededor de imágenes (son bloques en TipTap)
- `normalizeForComparison()`: También normaliza `\$` ↔ `$` para prevenir phantom changes

**Prevención de cambios fantasma (phantom changes):**
- TipTap round-trip introduce diferencias cosméticas: `\n` → `\n\n` alrededor de imágenes, `$` → `\$`
- Root cause: DB text tiene literal `\n` (backslash-n) que `cleanDisplayText` no convierte cuando seguido de letra (para proteger comandos LaTeX como `\newline`). Esto une imágenes con texto adyacente en la misma línea.
- `normalizeForComparison()` normaliza ambos lados antes de comparar en `onUpdate` y `handleUnifiedChange`
- Probado con 10+ preguntas (PAES 65): zero phantom changes, save/reload funciona correctamente

---

## Problema 4: Pauta de corrección incompleta (RESUELTO)

### Problema original
- Al analizar pauta para 65 preguntas, solo devolvía ~10 respuestas
- Causa: `max_tokens: 16000` en GPT-4o-mini, insuficiente para 65 preguntas en una sola llamada

### Solución implementada (commit 562c670)
- Se agregó batching de preguntas: `RUBRIC_QUESTIONS_PER_BATCH = 20`
- Para 65 preguntas: `ceil(65/20) = 4` llamadas API
- Cada llamada recibe el PDF completo + solo 20 preguntas
- Progress SSE muestra "Procesando preguntas 1-20 (batch 1 de 4)..."
- Merge con `seenQuestionIds` (first answer wins)

---

## Archivos clave

| Archivo | Rol |
|---------|-----|
| `frontend/src/components/RichMathText.tsx` | Renderiza texto mixto + LaTeX usando MathLive + CSS (preview + vista estudiante) |
| `frontend/src/components/MathField.tsx` | Editor WYSIWYG MathLive para tipo MATH, opciones, y popup de edición TipTap |
| `frontend/src/components/MathToolbar.tsx` | Barra de botones math reutilizable (exporta `MATH_TOOLBAR_BUTTONS`) |
| `frontend/src/components/QuestionEditor.tsx` | Editor preview-first: TipTap para enunciado, toggle edición con lápiz/check |
| `frontend/src/components/tiptap/QuestionTipTapEditor.tsx` | Editor TipTap con KaTeX math inline + imágenes + phantom-change prevention |
| `frontend/src/components/tiptap/serializers.ts` | Serialización bidireccional texto plano ↔ TipTap HTML + normalización round-trip |
| `frontend/src/components/tiptap/TipTapToolbar.tsx` | Toolbar: símbolos math + insertar imagen |
| `frontend/src/components/tiptap/MathEditPopup.tsx` | Popup floating con MathField al click en fórmula KaTeX |
| `backend/src/config/openai.ts` | Mathpix OCR, image re-hosting, gpt-4o-mini structuring, rubric batching |
| `backend/src/config/storage.ts` | Supabase Storage: uploadPDF(), uploadImage(), deletePDF() |
| `backend/src/utils/mathPostProcess.ts` | Fix JSON escapes, repair broken LaTeX, wrap bare commands, Unicode→LaTeX |
