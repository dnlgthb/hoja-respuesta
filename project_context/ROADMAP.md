# MI HOJA - ROADMAP

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
| 4 | Sistema estudiantes | 🔄 En progreso |
| 5 | Corrección y resultados | ⏳ Pendiente |
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

### Fase 4: Sistema Estudiantes 🔄

**4.1 Sistema de Cursos (Backend + Frontend profesor)** ✅
- [x] Modelo Course y CourseStudent en base de datos
- [x] CRUD de cursos para profesor
- [x] Upload de lista de estudiantes (archivo Excel/CSV)
- [x] IA extrae nombres y emails del archivo (GPT-4o-mini)
- [x] Asociar prueba a un curso al crearla

**4.2 Tiempo Límite de Pruebas** ⏳
- [ ] Campo duración en minutos al activar prueba
- [ ] Validar solo UNA prueba activa a la vez
- [ ] Temporizador visible para estudiante
- [ ] Envío automático al vencer tiempo

**4.3 Frontend Estudiante (Flujo de ingreso)** ✅
- [x] Página de ingreso con código de 6 caracteres
- [x] Selección de nombre desde lista cerrada (buscador con autocompletado)
- [x] Confirmación: escribir "CONFIRMO"
- [x] Bloqueo de nombre una vez confirmado (course_student_id)
- [ ] Interfaz de prueba (PDF lado izquierdo + hoja de respuestas lado derecho)
- [ ] Formulario con 4 tipos de respuesta
- [ ] Autosave cada 10 segundos
- [ ] Botón de entrega con link de resultados

**4.4 Dashboard de Monitoreo (Profesor)** ✅
- [x] Ver estudiantes del curso con estado (No iniciado, En progreso, Entregado)
- [x] Resumen visual con contadores
- [x] Botón para desbloquear nombres (elimina intento)
- [x] Auto-refresh cada 30 segundos

### Fase 5: Corrección y Resultados ⏳
- [ ] Corrección automática (V/F, múltiple opción)
- [ ] Corrección con IA (desarrollo, matemáticas)
- [ ] Dashboard de resultados para profesor
- [ ] Edición manual de puntajes
- [ ] Página de resultados para estudiantes (acceso por link único)
- [ ] Generación de PDF con resultados
- [ ] Sistema de envío de emails (Resend)
- [ ] Exportación a Excel

### Fase 6: Testing y Ajustes ⏳
- [ ] Pruebas con 30 estudiantes simultáneos
- [ ] Ajustes de performance
- [ ] Pulir UX
- [ ] Documentación final
