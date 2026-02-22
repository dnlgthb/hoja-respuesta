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
- [x] Editor de preguntas por tipo (V/F, múltiple opción, desarrollo, matemática)
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
- [x] Renderizado LaTeX en frontend (RichMathText):
  - Componente que parsea texto mixto con delimitadores $...$ y $$...$$
  - Renderiza fórmulas usando MathLive (convertLatexToMarkup)
  - Integrado en: editor de preguntas, vista estudiante, resultados, modal rúbrica
  - Fix prompt IA: opciones con imágenes usan "[Ver imagen en el PDF]" en vez de repetir letra

---

## Pendientes Menores / Deuda Técnica

- [ ] Página de resultados para estudiantes (acceso por link único)
- [ ] Generación de PDF con resultados
- [ ] Pruebas creadas antes del fix de alternativas necesitan corrección manual
