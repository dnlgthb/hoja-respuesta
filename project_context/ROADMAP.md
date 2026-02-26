# APROBA - ROADMAP

## Descripción del Proyecto

Plataforma web que transforma pruebas existentes (Word/PDF) en hojas de respuestas digitales autocalificables, sin necesidad de cuentas de estudiante.

**Problema:** Digitalizar evaluaciones requiere crear cuentas, rehacer preguntas manualmente, y depender de plataformas complejas (Moodle, Google Forms, Lirmi).

**Solución:** Experiencia tan simple como papel, pero automatizada, segura y escalable.

**Objetivo Beta:** 30 estudiantes simultáneos, <$20/mes, sin cambiar infraestructura al escalar.

---

## Estado Actual

| Fase | Descripción | Estado |
|------|-------------|--------|
| 1 | Setup inicial | ✅ Completada |
| 2 | Backend básico | ✅ Completada |
| 3 | Frontend profesor | ✅ Completada |
| 4 | Sistema estudiantes | ✅ Completada |
| 5 | Corrección y resultados | ✅ Completada |
| 5.5 | Deploy (Vercel + Railway) | ✅ Completada |
| 6 | Testing y ajustes | ⏳ Pendiente |

---

## Fases Detalladas

### Fase 1: Setup Inicial ✅
- [x] Cuentas creadas: Vercel, Railway, Neon, Supabase, Resend, OpenAI
- [x] Repositorio Git configurado
- [x] Proyecto Next.js + Express inicializado
- [x] Base de datos PostgreSQL conectada
- [x] Variables de entorno configuradas

### Fase 2: Backend ✅
- [x] Autenticación JWT de profesores
- [x] CRUD completo de pruebas
- [x] Upload de PDF a Supabase Storage
- [x] Integración IA: análisis de documentos con GPT-4o-mini
- [x] Sistema de códigos de acceso (6 caracteres)
- [x] Endpoints para actualizar/eliminar preguntas

### Fase 3: Frontend Profesor ✅
- [x] Login/registro con validación
- [x] Dashboard con lista de pruebas
- [x] Crear prueba + upload PDF
- [x] Análisis automático con IA
- [x] Editor de preguntas por tipo (V/F, múltiple opción, desarrollo, matemática) — preview-first con toggle edición
- [x] Configuración de puntajes
- [x] Activación con código de 6 caracteres y QR
- [x] Duplicar pruebas existentes (copia con preguntas)
- [x] Estados de prueba: Borrador / Activa / Finalizada
- [x] Navegación inteligente desde dashboard (Editar → Monitor → Resultados)

### Fase 4: Sistema Estudiantes ✅

**4.1 Sistema de Cursos (Backend + Frontend profesor)** ✅
- [x] Modelo Course y CourseStudent en base de datos
- [x] CRUD de cursos para profesor
- [x] Upload de lista de estudiantes (archivo Excel/CSV)
- [x] IA extrae nombres y emails del archivo (GPT-4o-mini)
- [x] Asociar prueba a un curso al crearla

**4.2 Tiempo Límite de Pruebas** ✅
- [x] Campo duración en minutos al activar prueba
- [x] Permitir múltiples pruebas activas simultáneas
- [x] Temporizador visible para estudiante
- [x] Envío automático al vencer tiempo
- [x] Cierre automático de pruebas expiradas (al acceder al dashboard o monitor)

**4.3 Frontend Estudiante (Flujo de ingreso)** ✅
- [x] Página de ingreso con código de 6 caracteres
- [x] Selección de nombre desde lista cerrada (buscador con autocompletado)
- [x] Campo de email opcional (para recibir resultados)
- [x] Confirmación: escribir "CONFIRMO"
- [x] Bloqueo de nombre una vez confirmado (course_student_id)
- [x] Interfaz de prueba (PDF lado izquierdo + hoja de respuestas lado derecho)
- [x] Formulario con 4 tipos de respuesta (V/F, alternativas, desarrollo, matemática)
- [x] Autosave cada 10 segundos
- [x] Botón de entrega con confirmación
- [x] Pantalla post-entrega con mensaje sobre resultados por email

**4.4 Dashboard de Monitoreo (Profesor)** ✅
- [x] Ver estudiantes del curso con estado (No iniciado, En progreso, Entregado)
- [x] Resumen visual con contadores
- [x] Botón para desbloquear nombres (permite reintentar)
- [x] Auto-refresh cada 30 segundos
- [x] Botón acceso directo desde página de activación
- [x] Botón para cerrar prueba manualmente

### Fase 5: Corrección y Resultados ✅

**5.1 Corrección Automática** ✅
- [x] Corrección V/F con normalización (acepta: v, V, verdadero, true, f, F, falso, false, etc.)
- [x] Corrección múltiple opción con normalización (acepta: a, A, a), A), (a), etc.)
- [x] Disparo automático al cerrar prueba

**5.2 Corrección con IA** ✅
- [x] Corrección de preguntas de desarrollo con GPT-4o-mini
- [x] Corrección de preguntas matemáticas con GPT-4o-mini
- [x] Uso de pauta de corrección definida por profesor
- [x] Feedback constructivo automático

**5.3 Dashboard de Resultados (Profesor)** ✅
- [x] Vista general con estadísticas (promedio, max, min)
- [x] Lista de estudiantes con puntajes y porcentajes
- [x] Detalle expandible por estudiante
- [x] Visualización de respuestas vs respuestas correctas
- [x] Ver pauta de corrección en modal (preguntas desarrollo)
- [x] Edición manual de puntajes (solo enteros)
- [x] Edición de feedback
- [x] Marcar como revisado
- [x] Selección múltiple de estudiantes

**5.4 Envío de Resultados** ✅
- [x] Envío de emails con Resend (código listo)
- [x] Pendiente: verificar dominio en Resend para producción

**5.5 Exportación** ✅
- [x] Exportación a Excel (.xlsx)
- [x] Incluye nombre, email, puntaje, porcentaje por estudiante

### Fase 5.5: Deploy ✅
- [x] Frontend desplegado en Vercel (hoja-respuesta.vercel.app)
- [x] Backend desplegado en Railway (con dominio público)
- [x] Variables de entorno configuradas en ambas plataformas
- [x] Root Directory configurado en ambos (frontend/ y backend/)
- [x] Fix tsconfig.json para compatibilidad con build de producción
- [x] Mover @prisma/client y prisma a dependencies (Railway omite devDependencies)
- [x] Convertir pdfExtractor.js a TypeScript (tsc no copia .js a dist/)
- [x] Wrap useSearchParams en Suspense boundary (requerido por Next.js en Vercel)
- [x] Fix script start del backend (dist/index.js → dist/server.js)

### Fase 6: Testing y Ajustes ⏳
- [ ] Pruebas con 30 estudiantes simultáneos
- [ ] Ajustes de performance
- [ ] Pulir UX
- [ ] Documentación final
- [ ] Verificar dominio en Resend para emails de producción

---

## Mejoras Implementadas (Post-Fase 5)

- [x] Normalización de saltos de línea al pegar pauta de corrección
- [x] Botones "Cancelar" con texto visible (no gris claro)
- [x] Input de duración permite borrar y editar libremente
- [x] Scroll funcional en página de prueba del estudiante
- [x] Texto legible en todos los inputs (text-gray-900)
- [x] Editor MathLive para respuestas matemáticas (estudiante y profesor)
- [x] Editor completo de preguntas (agregar, eliminar, reordenar, editar todos los campos)
- [x] Nomenclatura flexible de preguntas (soporta "I.a", "II.b", "1.1", etc.)
- [x] Opciones de corrección avanzadas:
  - Exigir justificación en respuestas Falso (con pauta)
  - Evaluar ortografía (puntaje configurable)
  - Evaluar redacción (puntaje configurable)
  - Exigir unidades en matemáticas (con penalización configurable)
- [x] Cálculo de nota chilena (escala 1.0-7.0, nota 4.0 al 60%)
- [x] Umbral de aprobación configurable por prueba
- [x] Cargar pauta PDF para auto-rellenar respuestas con IA:
  - Upload de pauta PDF → IA analiza y mapea respuestas a preguntas
  - Preview editable de sugerencias antes de aplicar
  - Batch update de preguntas al confirmar
  - Soporta V/F, alternativas, desarrollo y matemática
  - Campo `rubric_pdf_url` en modelo Test
  - Fix: V/F usa "Verdadero"/"Falso" (no "V"/"F") para coincidir con QuestionEditor
  - Fix: DEVELOPMENT y MATH mapean a `correction_criteria` (no `correct_answer`)
- [x] Migración a Vision API (PDF directo a GPT-4o-mini):
  - Reemplaza extracción de texto (pdfjs-dist) por envío directo del PDF como base64
  - Resuelve fórmulas matemáticas rotas, imágenes perdidas, contexto de preguntas anidadas
  - Aplica tanto a análisis de pruebas como a análisis de pautas de corrección
  - Nuevos campos en Question: context, has_image, image_description, image_page
  - Cero dependencias nativas nuevas (sin canvas, sin ImageMagick)
- [x] Migración a Mathpix OCR + extracción de imágenes:
  - Phase 1: Mathpix API para OCR especializado en matemáticas (LaTeX perfecto, $0.005/pág)
  - Phase 1.5: Re-hosting de imágenes de Mathpix CDN (~30 días expiración) a Supabase Storage (permanente)
  - Phase 2: gpt-4o-mini estructura .mmd en JSON con image_url por pregunta
  - Nuevo campo: `image_url` en Question (URL Supabase permanente)
  - Frontend: imágenes inline en QuestionEditor (profesor) y vista de prueba (estudiante)
  - Fallback: si Mathpix no configurado, usa GPT-4o Vision (sin imágenes extraídas)
  - Tiempo total: ~2 min para PAES 56 páginas (vs ~10 min con GPT-4o)
  - Tested: 65 preguntas, 18 con imágenes, todas en Supabase permanente
- [x] Renderizado LaTeX en frontend (RichMathText):
  - Componente que parsea texto mixto con delimitadores $...$ y $$...$$
  - Renderiza fórmulas usando MathLive (convertLatexToMarkup)
  - Integrado en: editor de preguntas, vista estudiante, resultados, modal rúbrica
  - Fix prompt IA: opciones con imágenes usan "[Ver imagen en el PDF]" en vez de repetir letra
- [x] Editor preview-first (QuestionEditor refactor):
  - Por defecto muestra preguntas renderizadas (RichMathText) en vez de textarea con LaTeX crudo
  - Toggle editar/ver con íconos lápiz/check para texto de pregunta y opciones de alternativas
  - Radios de respuesta correcta funcionan en ambos modos (preview y edición)
  - Respuesta correcta resaltada en verde en modo preview
  - Mejora drástica de legibilidad en pruebas con muchas preguntas (ej: PAES14, 65 preguntas)
- [x] Editor WYSIWYG para texto de preguntas y opciones de alternativas:
  - MathField (WYSIWYG) por defecto al editar texto de pregunta y opciones
  - Botones del toolbar (a/b, √, xⁿ, etc.) insertan elementos gráficos, no LaTeX crudo
  - Toggle Tx/𝑓x para cambiar entre MathField y textarea por opción
  - Conversión automática texto mixto ↔ \text{} para MathField
  - MathField compact prop para opciones de alternativas (tamaño reducido)
  - Fix: insertSymbol manipula .value directamente (no .insert()) para evitar que \text{} bloquee inserciones math
  - Line wrapping en MathField: CSS inyectado en shadow DOM para mostrar texto completo sin scroll horizontal
  - Fix: normalización \\% → \% en frontend y backend para porcentajes double-escaped por la IA
- [x] Editor TipTap unificado para texto de preguntas:
  - Reemplaza textarea + MathField por TipTap rich text editor con KaTeX math inline
  - Contexto + texto de pregunta unificados en un solo campo (context → null al guardar)
  - Click en fórmula renderizada → popup MathField para edición visual
  - Imágenes embebidas inline con drag-drop upload a Supabase
  - Toolbar con símbolos math + botón insertar imagen
  - Serialización bidireccional texto plano ↔ TipTap HTML (sin cambios de BD)
  - Prevención de cambios fantasma: normalización round-trip (imágenes + $ escaping)
  - Probado con PAES 65 preguntas: math + imágenes + contexto, zero phantom changes
- [x] **Modelo "Hoja de Respuesta"** — Simplificación completa del pipeline:
  - Nuevo pipeline: Mathpix OCR + UNA sola llamada gpt-4o-mini (identifica tipo/número/sección)
  - NO extrae texto, opciones, contexto, imágenes, LaTeX
  - PDF se muestra al lado izquierdo, hoja de respuesta compacta al derecho
  - Secciones con números romanos detectadas como divisores entre preguntas
  - MC en modo bubble-sheet: botones compactos A/B/C/D en fila horizontal
  - V/F con colores neutros (azul) en vez de verde/rojo
  - TipTap editor oculto cuando no hay texto (modo hoja de respuesta)
  - Backward compat: tests antiguos con texto siguen mostrándose completos
  - Tiempo extracción: ~20-30s (vs ~2 min pipeline anterior)
  - Pipeline anterior (`analyzeDocumentMathpix`) marcado `@deprecated`
- [x] Fix duplicación de pruebas: `createMany` batch insert (4s vs 40s+ timeout)
- [x] Corrección DEVELOPMENT más flexible: reglas explícitas, omite PREGUNTA vacía
- [x] Prompt de pauta mejorado: copia multi-párrafo completa (no se corta en punto aparte)
- [x] Extracción de estudiantes mejorada: rechaza metadata de planillas (Asignatura, Promedio, etc.)

---

## Pendientes Menores / Deuda Técnica

- [ ] Página de resultados para estudiantes (acceso por link único)
- [ ] Generación de PDF con resultados
- [ ] Limpiar código legacy del pipeline de extracción completa (`analyzeDocumentMathpix` y fases asociadas)
- [ ] Pruebas creadas antes del fix de alternativas necesitan corrección manual
