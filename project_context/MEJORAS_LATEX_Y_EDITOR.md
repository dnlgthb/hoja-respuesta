# Mejoras pendientes: LaTeX, Editor de preguntas y calidad de IA

## Estado actual (Feb 2026)

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

**Texto de la pregunta:**
- Por defecto muestra solo el `RichMathText` renderizado (fondo gris claro, clickeable)
- Botón lápiz (Pencil icon) en la esquina para alternar a modo edición
- Modo edición: **MathField WYSIWYG** por defecto (toolbar + editor gráfico de math)
- Toggle "Tx/𝑓x" permite cambiar entre MathField (WYSIWYG) y textarea (LaTeX crudo)
- Conversión automática: texto mixto `"texto $math$ texto"` ↔ `\text{texto }math\text{ texto}` para MathField
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
- `isEditingText` (boolean, default false) — toggle para texto de pregunta
- `isEditingOptions` (boolean, default false) — toggle para alternativas
- `textMathMode` (boolean, default true) — MathField vs textarea para texto
- `optionMathMode` (boolean[], auto-detect) — MathField vs input por opción
- Ambos edit states se resetean a false cuando la pregunta se colapsa (`isExpanded = false`)

**Problema resuelto: inserción de math dentro de \text{}:**
- MathLive's `.insert()` trata LaTeX como texto literal cuando el cursor está dentro de un bloque `\text{}`
- Solución en `MathField.tsx`: `insertSymbol` manipula `.value` directamente en vez de usar `.insert()`
- Reemplaza `#0` placeholders por `\placeholder{}` para que MathLive renderice campos editables

---

## Problema 3: Calidad de extracción de la IA

### Síntomas
- La IA a veces no transcribe bien las expresiones matemáticas del PDF
- Ejemplo: Q17 tenía `$2^{2} + \frac{5}{1} - 14$` pero ninguna opción coincide (probablemente la expresión original era diferente)
- Opciones sin delimitadores `$` (ya mitigado con post-procesamiento)

### Causas
- GPT-4o-mini tiene limitaciones en la interpretación visual de PDFs matemáticos
- El prompt pide usar `$...$` pero la IA no siempre cumple consistentemente
- PDFs escaneados o con fuentes matemáticas especiales son más difíciles

### Mejoras posibles
1. **Mejorar el prompt**: Agregar más ejemplos de transcripción correcta, especialmente para casos complejos
2. **Modelo más potente**: Usar GPT-4o (no mini) para pruebas con mucho contenido matemático
3. **Validación de LaTeX**: Después de la extracción, intentar parsear cada expresión y marcar errores
4. **Feedback loop**: Cuando el profesor corrige una expresión, guardar before/after para mejorar el prompt

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
| `frontend/src/components/RichMathText.tsx` | Renderiza texto mixto + LaTeX usando MathLive + CSS |
| `frontend/src/components/MathField.tsx` | Editor WYSIWYG para preguntas tipo MATH, texto de pregunta, y opciones de alternativas (prop `compact`) |
| `frontend/src/components/MathToolbar.tsx` | Barra de botones math reutilizable |
| `frontend/src/components/QuestionEditor.tsx` | Editor preview-first de preguntas (profesor): toggle edición con lápiz/check |
| `backend/src/config/openai.ts` | Prompts de IA, análisis de PDF, rubric batching |
| `backend/src/utils/mathPostProcess.ts` | Fix JSON escapes, repair broken LaTeX, wrap bare commands, Unicode→LaTeX |
