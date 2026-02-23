# APROBA - DECISIONES TÉCNICAS

Registro de decisiones técnicas tomadas durante el desarrollo del proyecto.

---

## Stack Tecnológico

| Capa | Tecnología | Justificación |
|------|------------|---------------|
| Frontend | Next.js 16 + TypeScript | Mejor soporte de IA, SSR listo, Vercel optimizado |
| Estilos | Tailwind CSS | Rápido, utility-first, bien documentado |
| Backend | Express + TypeScript | Ecosistema gigante, IA lo conoce muy bien |
| ORM | Prisma | Migraciones automáticas, type-safety, Prisma Studio |
| Base de datos | PostgreSQL (Neon) | Escalable, portable, tier gratuito generoso |
| Storage | Supabase Storage | Simple, URLs públicas, tier gratuito |
| Email | Resend | 3,000 emails/mes gratis, API simple |
| IA | OpenAI GPT-4o-mini | Barato (~$0.01/análisis), rápido, preciso |
| Hosting Frontend | Vercel | Gratis, optimizado para Next.js |
| Hosting Backend | Railway | $5/mes, simple, templates listos |

**Razón principal:** Todas las tecnologías son estándar y agnósticas de hosting. Migrar a AWS/GCP requiere solo cambiar configuración, no reescribir código.

---

## Arquitectura de la Interfaz del Estudiante

**Decisión:** PDF + Hoja de Respuestas Digital (lado a lado)

**Alternativas evaluadas:**
1. PDF + Hoja separada ← elegida
2. Interfaz digital interactiva pura (sin PDF)
3. Híbrida (PDF opcional como modal)

**Razones:**
- Simplicidad para el profesor (sube PDF y listo)
- Funciona con cualquier formato de PDF (ecuaciones, diagramas, imágenes)
- Cero riesgo de pérdida de información
- Desarrollo más rápido para el beta

**Trade-off aceptado:** UX menos "moderna" a cambio de confiabilidad total.

---

## Sistema de Cursos y Lista Cerrada

**Decisión:** Estudiantes seleccionan su nombre de una lista predefinida (no lo escriben)

**Problema resuelto:** El sistema anterior usaba `device_token` en localStorage. Un estudiante en modo incógnito podía reingresar con otro nombre, evadiendo el bloqueo.

**Alternativas descartadas:**

| Solución | Motivo de descarte |
|----------|-------------------|
| Detectar modo incógnito | Navegadores modernos parchearon las técnicas |
| Email obligatorio + bloqueo | Pueden inventar otro email |
| Cuentas de estudiante | Rompe el espíritu del proyecto (cero fricción) |
| Códigos individuales por estudiante | Quita tiempo de la prueba al distribuirlos |
| Links únicos por email | Estudiantes olvidan sus emails constantemente |

**Modelo implementado:**
- Profesor tiene múltiples **Cursos** (ej: "3° Medio A", "3° Medio B")
- Curso tiene lista de **Estudiantes** (nombre + email opcional)
- Una **Prueba** pertenece a UN Curso (relación 1:1)
- Subida de lista de estudiantes con IA (como el PDF de la prueba)

**Flujo profesor (una vez al año):**
1. Crea Curso y sube archivo con lista de estudiantes
2. IA extrae nombres y emails
3. Al crear prueba, la asocia a un curso existente

**Flujo estudiante:**
1. Ingresa código de prueba
2. Busca su nombre (buscador con autocompletado)
3. Confirma escribiendo "CONFIRMO"
4. Nombre queda bloqueado para esa prueba

**Desbloqueo:** Profesor puede desbloquear nombres desde su dashboard si alguien se equivocó.

---

## Tiempo Límite de Pruebas

**Decisión:** El profesor define duración al activar la prueba

**Mecanismo:**
- Al activar, el profesor ingresa duración en minutos (ej: 90)
- Solo puede haber UNA prueba activa a la vez por profesor
- Al vencer el tiempo → envío automático de respuestas pendientes
- Estudiantes que no entregaron quedan con lo que alcanzaron a responder

---

## Seguridad de Estudiantes (Sin Cuentas)

**Decisión:** Token por dispositivo (UUID en localStorage) + Lista cerrada de nombres

**Mecanismo:**
- Estudiante selecciona su nombre de lista predefinida
- Sistema genera `device_token` (UUID único)
- Token se guarda en localStorage del navegador
- Reingreso con mismo token = acceso directo
- Nombre ya confirmado por otro = bloqueado (profesor debe desbloquear)

**Ventajas:**
- Cero fricción para estudiantes
- Sin contraseñas que olvidar
- Imposible inventar nombres falsos
- Profesor tiene control total

---

## Tipos de Preguntas Soportados

| Tipo | Corrección | Implementación |
|------|------------|----------------|
| Verdadero/Falso | Automática | Comparación directa |
| Múltiple Opción | Automática | Comparación de opción seleccionada |
| Desarrollo | IA + Manual | GPT-4o-mini evalúa con pauta del profesor |
| Matemática | IA + Manual | GPT-4o-mini evalúa procedimiento y resultado |

**Extracción:** GPT-4o-mini analiza el PDF y detecta automáticamente el tipo de cada pregunta.

---

## Extracción de Estudiantes con IA

**Decisión:** Usar GPT-4o-mini para extraer nombres de archivos Excel/CSV

**Flujo:**
1. Profesor sube archivo Excel/CSV con lista de estudiantes
2. Backend convierte a formato de texto plano (CSV)
3. GPT-4o-mini extrae nombres y emails con prompt especializado
4. Si IA falla → fallback a parseo manual por columnas

**Prompt optimizado para:**
- Ignorar encabezados ("Nombre", "Estudiante", etc.)
- Ignorar números de lista (1, 2, 3...)
- Solo omitir nombres explícitamente tachados
- Evaluar cada nombre individualmente
- En caso de duda, incluir (mejor incluir de más que omitir)

**Ventaja:** Funciona con cualquier formato de archivo, no requiere estructura específica.

---

## Modelo de IA

**Decisión:** GPT-4o-mini (no GPT-4)

**Razones:**
- 10x más barato que GPT-4
- Suficientemente preciso para extracción visual de preguntas
- Latencia baja (~2-3 segundos por análisis)
- Costo estimado: ~$0.01 por PDF, ~$0.002 por corrección

---

## Migración a Vision API (PDF directo)

**Decisión:** Enviar PDFs directamente a GPT-4o-mini como archivos base64 en lugar de extraer texto con pdfjs-dist.

**Problema resuelto:** La extracción de texto con pdfjs-dist perdía:
- Expresiones matemáticas (fracciones, raíces, exponentes aparecían como cuadrados rotos)
- Imágenes/diagramas/gráficos se perdían completamente
- Contexto de preguntas anidadas (enunciados padre)

**Enfoque elegido:** PDF directo a OpenAI (sin librería de conversión a imágenes)

**Alternativas descartadas:**

| Solución | Motivo de descarte |
|----------|-------------------|
| `pdf-to-img` | Dependencia nativa de canvas, problemas en Railway |
| `pdf2pic` | Requiere GraphicsMagick/ImageMagick en el servidor |
| pdfjs-dist renderizar a canvas | Requiere `canvas` npm (nativo), complicado en producción |
| **PDF directo a OpenAI** | ✅ Elegida: cero dependencias nativas, OpenAI convierte internamente |

**Campos nuevos en Question:** `context` (enunciado padre), `has_image`, `image_description`, `image_page`

**Aplica a:** Análisis de pruebas (`analyzeDocument`) y análisis de pautas (`analyzeRubric`)

---

## Convenciones de Código

**Nombrado:**
- Backend: snake_case (Prisma/PostgreSQL)
- Frontend: camelCase (TypeScript/React)
- Transformación automática en interceptores Axios

**Estructura del repositorio:**
```
/frontend    → Next.js app (puerto 3000)
/backend     → Express API (puerto 3001)
```

**Validación:**
- Frontend: react-hook-form + zod
- Backend: Validación en controllers

**Librerías adicionales:**
- qrcode.react → Generación de códigos QR
- lucide-react → Íconos
- axios → Cliente HTTP
- xlsx → Parseo de archivos Excel/CSV (backend)
- mathlive → Editor de expresiones matemáticas (LaTeX)

---

## Deploy en Producción

**Frontend:** Vercel (hoja-respuesta.vercel.app)
- Root Directory: `frontend`
- Framework: Next.js (auto-detectado)
- Variable: `NEXT_PUBLIC_API_URL` apuntando al backend en Railway

**Backend:** Railway (hoja-respuesta-production.up.railway.app)
- Root Directory: `backend`
- Build: `prisma generate && tsc`
- Start: `node dist/server.js`
- Target Port: dejar vacío (auto-detect, Railway asigna PORT dinámicamente)
- Variables de entorno configuradas en el dashboard de Railway
- Variable `FRONTEND_URL` = `https://hoja-respuesta.vercel.app` (para CORS)

**CORS:** La URL de Vercel está hardcodeada en `app.ts` + se lee `FRONTEND_URL` como fallback.

**Ajustes necesarios para deploy:**

| Problema | Solución |
|----------|----------|
| `verbatimModuleSyntax` en tsconfig incompatible con CommonJS | Reemplazar por tsconfig estándar (module: commonjs, esModuleInterop: true) |
| `@prisma/client` en devDependencies | Mover a dependencies (Railway omite devDeps en producción) |
| `pdfExtractor.js` no se copiaba a dist/ | Convertir a TypeScript (.ts) |
| `useSearchParams()` sin Suspense boundary | Envolver en `<Suspense>` (requerido por Next.js para SSG) |
| Script start apuntaba a dist/index.js | Corregir a dist/server.js |
| Target Port hardcodeado a 3001 en Railway | Dejar vacío: Railway asigna PORT dinámico (ej: 8080), el proxy debe auto-detectar |
| CORS bloqueaba requests de Vercel | Agregar `https://hoja-respuesta.vercel.app` al whitelist en `app.ts` |
| `NEXT_PUBLIC_API_URL` sin `https://` | Asegurar que el valor incluya `https://` (sin `:` extra) |

---

## Mapeo de Campos por Tipo de Pregunta

**Convención crítica:** Cada tipo de pregunta usa campos distintos. La pauta IA, el QuestionEditor, y la corrección automática deben respetar esto.

| Tipo | Campo principal | Valor esperado | `correction_criteria` |
|------|----------------|----------------|----------------------|
| TRUE_FALSE | `correct_answer` | `"Verdadero"` o `"Falso"` (palabras completas, NUNCA "V"/"F") | Solo si requiere justificación de Falso |
| MULTIPLE_CHOICE | `correct_answer` | Letra: `"A"`, `"B"`, `"C"`, `"D"` | No se usa |
| DEVELOPMENT | `correction_criteria` | Pauta/respuesta modelo (texto libre) | `correct_answer` = no se usa |
| MATH | `correction_criteria` | Resultado numérico/expresión (comparado por IA) | `correct_answer` = no se usa |

**Nota:** La corrección automática (V/F y alternativas) tiene normalización que acepta múltiples formatos ("v", "verdadero", "V", etc.), pero el **QuestionEditor** usa las palabras completas `"Verdadero"`/`"Falso"` como valores de radio buttons. Siempre guardar en ese formato para consistencia visual.

---

## Editor de Matemáticas (MathLive)

**Decisión:** Usar MathLive para entrada y visualización de expresiones matemáticas

**Componentes:**
- **MathField:** Editor WYSIWYG con barra de herramientas (fracciones, raíces, exponentes, etc.). Soporta `compact` prop para uso en opciones de alternativas.
- **MathToolbar:** Barra de 12 botones reutilizable (fracción, raíz, exponente, subíndice, π, ±, ∞, ≠, ≤, ≥, ×, ·)
- **MathDisplay:** Renderizado estático de LaTeX puro (usa `convertLatexToMarkup`)
- **RichMathText:** Renderizado de texto mixto con LaTeX inline (`$...$` y `$$...$$`)

**Implementación:**
- Carga dinámica (solo cliente, no SSR) vía `import('mathlive')`
- Usa fuentes del sistema (`fontsDirectory = null`)
- RichMathText parsea delimitadores `$...$` y renderiza cada segmento por separado
- Si el texto no contiene `$`, retorna texto plano sin cargar MathLive (optimización)
- `insertSymbol` manipula `.value` directamente (no `.insert()`) para evitar que MathLive trate LaTeX como texto dentro de bloques `\text{}`

**Dónde se usa RichMathText:**
- QuestionEditor: preview de texto de pregunta y opciones de alternativas (modo preview-first)
- Vista estudiante: texto de preguntas y opciones de alternativas
- Resultados: texto de preguntas, respuesta correcta, modal de criterios
- Editor de prueba: modal de rúbrica

**Razones:**
- Gratuito y open source
- Soporte nativo de LaTeX
- Teclado virtual opcional
- Funciona bien en móviles

---

## Editor Preview-First (QuestionEditor)

**Decisión:** Mostrar preguntas en modo preview renderizado por defecto, con edición colapsable via toggle

**Problema resuelto:** Con 65 preguntas (PAES14), el editor mostraba para cada pregunta: MathToolbar (12 botones) + textarea con LaTeX crudo + vista previa. La página era interminable e ilegible para el profesor.

**Patrón implementado:**
- **Modo preview (default):** Solo muestra RichMathText renderizado — el profesor ve la pregunta como la verá el estudiante
- **Modo edición (toggle):** Click en ícono lápiz o en el preview → abre MathField WYSIWYG (por defecto) o textarea
- Toggle "Tx/𝑓x" permite cambiar entre MathField y textarea
- Click en ícono check → colapsa de vuelta al preview
- Estados se resetean al colapsar la pregunta

**Aplica a:**
- Texto de la pregunta (toggle `isEditingText`, `textMathMode` default true)
- Opciones de alternativas (toggle `isEditingOptions`, `optionMathMode[]` auto-detect por opción)
- Conversión automática texto mixto ↔ `\text{}` para MathField
- Radios de respuesta correcta funcionan en ambos modos (no necesita abrir editor)

**No aplica a (ya compactos):**
- TRUE_FALSE: solo 2 radios
- DEVELOPMENT: solo textarea de criterios
- MATH: MathField ya es WYSIWYG
