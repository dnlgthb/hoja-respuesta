# ARQUITECTURA - Aproba

> Contexto rápido para programar. Ver ROADMAP.md para estado del proyecto y DECISIONES_TECNICAS.md para justificaciones.

---

## 1. Estructura de Carpetas

```
hoja-respuesta/
├── backend/                      # Express API (puerto 3001)
│   ├── src/
│   │   ├── app.ts               # Config Express + rutas
│   │   ├── server.ts            # Entry point
│   │   ├── config/
│   │   │   ├── database.ts      # Prisma client
│   │   │   ├── env.ts           # Validación env vars
│   │   │   ├── multer.ts        # Upload config (10MB, solo PDF)
│   │   │   ├── openai.ts        # Cliente OpenAI
│   │   │   └── storage.ts       # Cliente Supabase Storage
│   │   ├── modules/
│   │   │   ├── auth/            # Autenticación profesor
│   │   │   │   ├── auth.routes.ts
│   │   │   │   ├── auth.controller.ts
│   │   │   │   ├── auth.service.ts
│   │   │   │   └── auth.middleware.ts
│   │   │   ├── tests/           # CRUD pruebas + preguntas + monitoreo
│   │   │   │   ├── tests.routes.ts
│   │   │   │   ├── tests.controller.ts
│   │   │   │   └── tests.service.ts
│   │   │   ├── courses/         # CRUD cursos + estudiantes
│   │   │   │   ├── courses.routes.ts
│   │   │   │   ├── courses.controller.ts
│   │   │   │   └── courses.service.ts
│   │   │   └── student/         # Endpoints públicos estudiantes
│   │   │       ├── student.routes.ts
│   │   │       ├── student.controller.ts
│   │   │       └── student.service.ts
│   │   └── utils/
│   │       ├── generateCode.ts  # Genera código 6 chars
│   │       ├── gradeCalculator.ts # Cálculo nota chilena
│   │       ├── mathPostProcess.ts # Fix LaTeX escapes, repair broken, Unicode→LaTeX
│   │       └── pdfExtractor.ts  # Convierte PDF a base64 para Vision API
│   └── prisma/
│       └── schema.prisma        # Modelos BD
│
├── frontend/                     # Next.js (puerto 3000)
│   └── src/
│       ├── app/
│       │   ├── layout.tsx
│       │   ├── page.tsx         # Home
│       │   ├── login/page.tsx   # Auth
│       │   ├── dashboard/page.tsx
│       │   ├── tests/
│       │   │   ├── new/page.tsx           # Crear + upload + análisis IA
│       │   │   └── [id]/
│       │   │       ├── page.tsx           # Editor preguntas
│       │   │       ├── activate/page.tsx  # Código QR
│       │   │       └── monitor/page.tsx   # Monitoreo estudiantes
│       │   ├── cursos/
│       │   │   ├── page.tsx               # Lista cursos
│       │   │   ├── nuevo/page.tsx         # Crear curso
│       │   │   └── [id]/page.tsx          # Detalle + estudiantes
│       │   └── prueba/
│       │       ├── page.tsx               # Ingreso estudiante (lista cerrada)
│       │       ├── [attemptId]/page.tsx   # Interfaz de prueba
│       │       └── resultado/[resultsToken]/page.tsx
│       ├── components/
│       │   ├── Navbar.tsx
│       │   ├── ProtectedRoute.tsx
│       │   ├── QuestionEditor.tsx  # Editor preguntas (TipTap unified editor)
│       │   ├── TestCard.tsx
│       │   ├── MathField.tsx      # Editor interactivo MathLive (LaTeX)
│       │   ├── MathToolbar.tsx    # Barra botones math reutilizable (fracción, raíz, etc.)
│       │   ├── MathDisplay.tsx    # Render LaTeX puro (MathLive)
│       │   ├── RichMathText.tsx   # Render texto mixto + LaTeX ($...$)
│       │   └── tiptap/           # Editor TipTap para texto de preguntas
│       │       ├── QuestionTipTapEditor.tsx  # Editor principal (KaTeX math + imágenes)
│       │       ├── TipTapToolbar.tsx         # Toolbar: math symbols + imagen
│       │       ├── MathEditPopup.tsx         # Popup MathField al click en fórmula
│       │       ├── serializers.ts            # Plain text ↔ TipTap HTML (bidireccional)
│       │       └── tiptap-editor.css         # Estilos KaTeX + editor
│       ├── lib/
│       │   ├── api.ts           # Axios + interceptores
│       │   └── auth.ts          # JWT en localStorage
│       ├── config/constants.ts
│       └── types/index.ts
│
└── project_context/              # Documentación
```

---

## 2. Modelos de Datos

| Modelo | Campos clave | Relaciones |
|--------|--------------|------------|
| **Teacher** | id, email (unique), password_hash, name | → tests[], courses[] |
| **Course** | id, teacher_id, name, year | → teacher, students[], tests[] |
| **CourseStudent** | id, course_id, student_name, student_email? | → course, student_attempts[] |
| **Test** | id, teacher_id, course_id?, title, status, access_code, pdf_url, rubric_pdf_url | → teacher, course?, questions[], student_attempts[] |
| **Question** | id, test_id, question_number, question_label?, type, question_text, points, options, correct_answer, correction_criteria, context?, has_image, image_description?, image_page?, **image_url?** | → test, answers[] |
| **StudentAttempt** | id, test_id, course_student_id?, student_name, student_email?, device_token, results_token, status, is_unlocked | → test, course_student?, answers[] |
| **Answer** | id, student_attempt_id, question_id, answer_value, points_earned, ai_feedback | → student_attempt, question |

### Enums

| Enum | Valores |
|------|---------|
| TestStatus | `DRAFT` → `ACTIVE` → `CLOSED` |
| QuestionType | `TRUE_FALSE`, `MULTIPLE_CHOICE`, `DEVELOPMENT`, `MATH` |
| AttemptStatus | `IN_PROGRESS`, `SUBMITTED` |

---

## 3. Endpoints Backend

### Auth (`/api/auth`)

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| POST | `/register` | No | Crear cuenta profesor |
| POST | `/login` | No | Login → JWT |
| GET | `/me` | JWT | Datos profesor actual |

### Tests (`/api/tests`) - Todos requieren JWT

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/` | Crear prueba (status: DRAFT) |
| GET | `/` | Listar pruebas del profesor |
| GET | `/:id` | Detalle prueba + preguntas |
| PUT | `/:id` | Actualizar prueba |
| DELETE | `/:id` | Eliminar prueba |
| POST | `/:id/upload-pdf` | Subir PDF a Supabase |
| POST | `/:id/analyze-pdf` | Analizar PDF con IA → crear preguntas |
| POST | `/:id/analyze-rubric` | Subir pauta PDF → IA mapea respuestas a preguntas |
| POST | `/:id/activate` | Generar código 6 chars, status → ACTIVE |
| POST | `/:id/close` | Cerrar prueba activa |
| POST | `/:id/duplicate` | Duplicar prueba con preguntas (batch insert) |
| PUT | `/:id/questions/batch` | Actualizar múltiples preguntas (batch) |
| PUT | `/:id/questions/:questionId` | Actualizar pregunta |
| DELETE | `/:id/questions/:questionId` | Eliminar pregunta |
| PUT | `/:id/passing-threshold` | Actualizar exigencia (% mínimo nota 4.0) |
| POST | `/:id/send-results` | Enviar resultados por email |
| GET | `/:id/export` | Exportar resultados a Excel |
| GET | `/:id/results` | Dashboard de resultados |
| PUT | `/:id/answers/:answerId` | Editar puntaje/feedback manual |
| POST | `/:id/attempts/:attemptId/mark-reviewed` | Marcar intento como revisado |
| GET | `/:id/attempts` | **Monitoreo:** Lista estudiantes con estado |
| POST | `/:id/attempts/:attemptId/unlock` | **Monitoreo:** Desbloquear estudiante |

### Courses (`/api/courses`) - Todos requieren JWT

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/` | Crear curso |
| GET | `/` | Listar cursos del profesor |
| GET | `/:id` | Detalle curso + estudiantes |
| PUT | `/:id` | Actualizar curso |
| DELETE | `/:id` | Eliminar curso |
| POST | `/:id/students` | Agregar estudiantes (JSON) |
| POST | `/:id/upload` | Subir Excel/CSV → IA extrae nombres |
| DELETE | `/:id/students/:studentId` | Eliminar estudiante |

### Student (`/api/student`) - Públicos (sin JWT)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/test/:accessCode/students` | Lista estudiantes disponibles para prueba |
| POST | `/join` | Unirse a prueba (con courseStudentId) |
| GET | `/attempt/:attemptId` | Obtener intento (requiere x-device-token) |
| POST | `/attempt/:attemptId/save` | Guardar respuestas (autosave) |
| POST | `/attempt/:attemptId/submit` | Entregar prueba |

---

## 4. Servicios Externos

| Servicio | Uso | Config |
|----------|-----|--------|
| **Neon** | PostgreSQL | `DATABASE_URL` |
| **Supabase Storage** | PDFs + imágenes de preguntas (bucket: `test-pdfs`) | `SUPABASE_URL`, `SUPABASE_ANON_KEY` |
| **Mathpix** | OCR especializado en matemáticas (Phase 1: PDF → .mmd con LaTeX perfecto) | `MATHPIX_APP_ID`, `MATHPIX_APP_KEY` |
| **OpenAI** | Identificación de preguntas (tipo/número/sección), análisis pauta → respuestas, extracción estudiantes de Excel/CSV, corrección desarrollo/math | `OPENAI_API_KEY`, modelo: `gpt-4o-mini` |
| **Resend** | Emails (pendiente implementar) | `RESEND_API_KEY` |
| **Vercel** | Hosting frontend | Root Directory: `frontend`, Framework: Next.js |
| **Railway** | Hosting backend | Root Directory: `backend`, dominio público generado |

---

## 5. Flujo de Datos

```
┌─────────────────────────────────────────────────────────────────────┐
│                           PROFESOR                                  │
└─────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────┐    JWT en header     ┌─────────────────┐
│  Frontend       │ ──────────────────▶  │  Backend        │
│  Next.js:3000   │                      │  Express:3001   │
│                 │ ◀──────────────────  │                 │
└─────────────────┘    JSON response     └─────────────────┘
                                                  │
                    ┌──────────────┼──────────────┼──────────────┐
                    │              │              │              │
                    ▼              ▼              ▼              ▼
           ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
           │  Neon        │ │  Supabase    │ │  OpenAI      │ │  Mathpix     │
           │  PostgreSQL  │ │  Storage     │ │  GPT-4o-mini │ │  OCR math    │
           │              │ │  (PDFs+imgs) │ │  (estructura)│ │  (Phase 1)   │
           └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
```

### Flujo: Crear prueba con IA (Modelo "Hoja de Respuesta")

1. Profesor sube PDF → `POST /api/tests/:id/upload-pdf`
2. PDF se guarda en Supabase Storage → retorna URL
3. Profesor pide análisis → `POST /api/tests/:id/analyze-pdf`
4. **Phase 1 (OCR):** PDF completo se envía a Mathpix API → retorna .mmd con texto OCR
5. **Phase 2 (Identificación):** Texto limpio → **UNA sola llamada** a gpt-4o-mini que identifica número, tipo y sección de cada pregunta (NO extrae texto, opciones ni imágenes)
6. Backend crea registros Question con `question_text = ''`, opciones solo letras `["A","B","C","D"]`, secciones en `context`
7. Frontend muestra PDF al lado izquierdo + hoja de respuesta compacta al derecho (botones bubble-sheet para MC, V/F, textarea para desarrollo/math)
8. **Fallback:** Si Mathpix no está configurado, usa GPT-4o Vision (pipeline legacy con extracción completa)
9. **Backward compat:** Tests antiguos con `question_text` poblado siguen mostrando texto completo

### Flujo: Cargar pauta de corrección con IA

1. Profesor tiene prueba con preguntas → clic "Cargar pauta" en editor
2. Sube PDF de pauta → `POST /api/tests/:id/analyze-rubric`
3. PDF se guarda en Supabase Storage (`rubrics/`) → guarda `rubric_pdf_url`
4. Backend convierte PDF a base64
5. PDF directo + preguntas existentes se envían a GPT-4o-mini Vision API
6. IA mapea respuestas/criterios a cada pregunta por número (lee fórmulas y diagramas correctamente)
7. Frontend muestra preview editable con sugerencias
8. Profesor revisa/edita y confirma → `PUT /api/tests/:id/questions/batch`
9. Preguntas se actualizan en batch

### Flujo: Autenticación

```
Login → bcrypt.compare() → JWT.sign(teacherId, 7d) → localStorage
                                                          │
Cada request → Axios interceptor agrega header ───────────┘
                                                          │
Backend → authMiddleware verifica JWT → req.teacherId ────┘
```

### Flujo: Ingreso estudiante (lista cerrada)

```
1. Estudiante ingresa código 6 chars
2. GET /api/student/test/:accessCode/students → lista de CourseStudents
3. Estudiante selecciona su nombre del buscador/selector
4. Pantalla confirmación: "¿Eres [NOMBRE]?" + escribir "CONFIRMO"
5. POST /api/student/join { accessCode, courseStudentId }
6. Backend valida que courseStudentId pertenece al curso de la prueba
7. Si ya tiene intento → error (contactar profesor para desbloquear)
8. Crea StudentAttempt con course_student_id → retorna attemptId + deviceToken
9. Redirige a /prueba/[attemptId]
```

### Flujo: Upload estudiantes con IA

```
1. Profesor sube Excel/CSV → POST /api/courses/:id/upload
2. Backend convierte a texto plano (CSV)
3. Envía a GPT-4o-mini para extraer nombres y emails
4. Si IA falla → fallback a parseo manual por columnas
5. Crea CourseStudents en la base de datos
6. Retorna cantidad agregada + preview
```

---

## 6. Variables de Entorno

### Backend (.env)
```
DATABASE_URL=postgresql://...
JWT_SECRET=...
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
MATHPIX_APP_ID=...              # OCR matemático (opcional, fallback: GPT-4o Vision)
MATHPIX_APP_KEY=...
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=...
RESEND_API_KEY=re_...
PORT=3001
```

### Frontend (.env.local)
```
NEXT_PUBLIC_API_URL=http://localhost:3001   # local
NEXT_PUBLIC_API_URL=https://xxx.up.railway.app  # producción (en Vercel)
```

### Deploy
```
Frontend (Vercel):  hoja-respuesta.vercel.app  (futuro: aproba.ai)
Backend (Railway):  dominio generado por Railway (puerto 3001)
```

---

## 7. Convenciones

| Aspecto | Backend | Frontend |
|---------|---------|----------|
| Nombrado | snake_case (Prisma) | camelCase |
| Validación | En controllers | react-hook-form + zod |
| HTTP client | — | Axios con interceptores |
| Auth storage | — | localStorage (`auth_token`, `auth_user`) |
