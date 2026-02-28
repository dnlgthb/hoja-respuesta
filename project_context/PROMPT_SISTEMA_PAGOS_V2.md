# PROMPT PARA CLAUDE CODE: Sistema de Pagos, Cuentas e Instituciones — Aproba v2

## Contexto del Proyecto

Aproba (aproba.ai) es una plataforma educacional chilena que transforma pruebas PDF en hojas de respuestas digitales auto-calificables. El proyecto usa:

- **Frontend:** Next.js + TypeScript + Tailwind CSS (puerto 3000, Vercel)
- **Backend:** Express + TypeScript + Prisma (puerto 3001, Railway)
- **Base de datos:** PostgreSQL en Neon
- **Storage:** Supabase Storage (PDFs + imágenes)
- **IA:** OpenAI GPT-4o-mini (corrección) + Mathpix (OCR)
- **Email:** Resend
- **Arquitectura completa:** Ver `/project_context/ARQUITECTURA.md`
- **Decisiones técnicas:** Ver `/project_context/DECISIONES_TECNICAS.md`

---

## Objetivo General

Implementar tres sistemas interconectados:

1. **Sistema de pagos** con Flow (pasarela chilena)
2. **Sistema de cuentas institucionales** con agrupación por institución
3. **Seguridad de cuentas** (recovery, validación, rate limiting)

---

## PARTE 1: Modelo de Datos

### Nuevas tablas y campos

#### Tabla `Institution` (nueva)

```prisma
model Institution {
  id              String   @id @default(uuid())
  name            String   // "Colegio San Martín"
  contact_email   String   // Email del admin/contacto
  contact_name    String   // Nombre del contacto
  plan_price      Int      // Precio por profesor en CLP (6990)
  max_teachers    Int?     // Límite de profesores (null = sin límite)
  notes           String?  // Notas internas
  created_at      DateTime @default(now())
  updated_at      DateTime @updatedAt

  teachers      Teacher[]
  subscriptions InstitutionSubscription[]
}
```

#### Tabla `InstitutionSubscription` (nueva)

```prisma
model InstitutionSubscription {
  id                  String   @id @default(uuid())
  institution_id      String
  status              SubscriptionStatus @default(ACTIVE)
  current_period_start DateTime
  current_period_end   DateTime
  created_at          DateTime @default(now())
  updated_at          DateTime @updatedAt

  institution Institution @relation(fields: [institution_id], references: [id])
}
```

#### Tabla `Subscription` (nueva — para plan personal con Flow)

```prisma
model Subscription {
  id                  String             @id @default(uuid())
  teacher_id          String             @unique
  flow_subscription_id String?           // ID de suscripción en Flow
  flow_customer_id    String?            // ID del cliente en Flow
  plan_type           PlanType           @default(PERSONAL_MONTHLY)
  status              SubscriptionStatus @default(ACTIVE)
  price               Int                // Precio en CLP (8990)
  current_period_start DateTime
  current_period_end   DateTime
  grace_period_end    DateTime?          // period_end + 1 día
  created_at          DateTime @default(now())
  updated_at          DateTime @updatedAt

  teacher  Teacher    @relation(fields: [teacher_id], references: [id])
  payments Payment[]
}
```

#### Tabla `Payment` (nueva)

```prisma
model Payment {
  id              String   @id @default(uuid())
  subscription_id String
  flow_payment_id String?  // ID del pago en Flow
  amount          Int      // Monto en CLP
  status          PaymentStatus
  payment_date    DateTime
  created_at      DateTime @default(now())

  subscription Subscription @relation(fields: [subscription_id], references: [id])
}
```

#### Tabla `UsageCounter` (nueva)

```prisma
model UsageCounter {
  id              String   @id @default(uuid())
  teacher_id      String
  period_start    DateTime // Inicio del mes de uso
  period_end      DateTime // Fin del mes de uso
  student_attempts Int     @default(0) // Contador de intentos de estudiantes
  pdf_analyses    Int      @default(0) // Contador de análisis de PDF (Mathpix)
  created_at      DateTime @default(now())
  updated_at      DateTime @updatedAt

  teacher Teacher @relation(fields: [teacher_id], references: [id])

  @@unique([teacher_id, period_start])
}
```

#### Modificaciones a `Teacher`

```prisma
model Teacher {
  // ... campos existentes ...
  is_beta         Boolean  @default(false)
  is_verified     Boolean  @default(false)  // Email verificado
  institution_id  String?                   // null = personal
  reset_token     String?                   // Token para reset contraseña
  reset_token_exp DateTime?                 // Expiración del token

  institution   Institution?   @relation(fields: [institution_id], references: [id])
  subscription  Subscription?
  usage_counters UsageCounter[]
}
```

#### Nuevos Enums

```prisma
enum PlanType {
  PERSONAL_MONTHLY
}

enum SubscriptionStatus {
  ACTIVE
  GRACE_PERIOD
  SUSPENDED
  CANCELLED
}

enum PaymentStatus {
  PENDING
  COMPLETED
  FAILED
  REFUNDED
}
```

---

## PARTE 2: Planes y Precios

| Plan | Precio | Cobro | Pasarela |
|------|--------|-------|----------|
| **Personal mensual** | $8.990 CLP/mes | Automático | Flow |
| **Institucional** | $6.990 CLP/profesor/mes | Manual (transferencia/factura) | Sin Flow |

**Nota:** Solo planes mensuales por ahora. No hay plan anual ni plan gratuito.

**IVA:** Los precios incluyen IVA (19%). El neto sería ~$7.554 personal y ~$5.874 institucional.

---

## PARTE 3: Límites por Cuenta

Mismos límites para personal e institucional, por profesor:

| Recurso | Límite mensual | Qué consume |
|---------|---------------|-------------|
| **Intentos de estudiantes** | 500 | Cada vez que un estudiante se une a una prueba |
| **Análisis de PDF** | 50 | Cada vez que se analiza un PDF con Mathpix/IA |

### Comportamiento al alcanzar límites

**Intentos (500):**
- Las pruebas activas siguen funcionando (estudiantes que ya entraron pueden terminar)
- No se pueden ACTIVAR nuevas pruebas hasta el mes siguiente
- Mensaje claro al profesor: "Has alcanzado el límite de 500 intentos de estudiantes este mes. Podrás activar nuevas pruebas a partir del [fecha]."

**Análisis PDF (50):**
- No se pueden analizar nuevos PDFs
- Se puede seguir usando pruebas ya creadas
- Mensaje: "Has alcanzado el límite de 50 análisis de PDF este mes."

### Implementación de contadores

- Se crea un `UsageCounter` por profesor por mes (period_start = primer día del mes)
- Se incrementa atómicamente al crear un intento o analizar un PDF
- El contador se resetea creando un nuevo registro el primer día de cada mes

**IMPORTANTE: Separar tracking de bloqueo.**

- **Tracking (registro de uso):** Se ejecuta SIEMPRE para TODAS las cuentas, incluyendo `is_beta: true`. Esto permite monitorear el uso real de las cuentas beta y validar las estimaciones de costo.
- **Bloqueo (verificación de límite):** Se ejecuta SOLO si `is_beta: false`. Las cuentas beta nunca son bloqueadas por uso.

```typescript
// Ejemplo en POST /student/join:
await incrementAttemptCounter(teacherId); // SIEMPRE registra

// Ejemplo en POST /tests/:id/activate:
if (!teacher.is_beta) {
  await checkAttemptsLimit(teacherId); // solo bloquea si no es beta
}
```

Esto permite consultar el UsageCounter de cualquier profesor (beta o no) para ver su consumo real mensual y comparar con las estimaciones de costo por cuenta.

---

## PARTE 4: Política de Pagos

| Estado | Condición | Acceso |
|--------|-----------|--------|
| `ACTIVE` | Pago al día | Acceso completo |
| `GRACE_PERIOD` | 1 día después de falla de pago | Acceso completo |
| `SUSPENDED` | Más de 1 día sin pago | Solo lectura: ver datos, NO crear pruebas, NO activar pruebas |
| `CANCELLED` | Cancelación voluntaria | Igual que SUSPENDED hasta fin del período pagado |

**Reglas:**
- La cuenta NUNCA se elimina. Solo se suspende.
- Al pagar nuevamente → vuelve a ACTIVE automáticamente.
- Cuentas `is_beta: true` → siempre ACTIVE, sin verificar pago.
- Cuentas institucionales → el status depende de `InstitutionSubscription`, no de Flow.

---

## PARTE 5: Flujo de Usuario

### Registro y exploración (gratis)

```
1. Profesor se registra con nombre, email, contraseña
2. Recibe email de verificación (Resend)
3. Verifica email → is_verified = true
4. Accede al dashboard, puede explorar, crear cursos, subir listas
5. Intenta crear/activar prueba → verifica suscripción
6. Sin suscripción → redirige a /planes
```

### Pago personal (Flow)

```
1. Profesor elige plan personal mensual ($8.990)
2. Click "Suscribirse" → backend crea orden en Flow
3. Redirige a Flow (checkout hosted)
4. Profesor paga con Webpay/tarjeta/etc
5. Flow redirige de vuelta a /dashboard?payment=success
6. Webhook de Flow notifica al backend → crea Subscription ACTIVE
7. Profesor puede crear y activar pruebas
```

### Suscripción institucional (manual)

```
1. Admin de Aproba (tú) crea Institution con datos del colegio
2. Crea cuentas Teacher con institution_id vinculado
3. Cada profesor recibe email con link para establecer contraseña
4. InstitutionSubscription se crea manualmente con fechas
5. Profesores acceden con suscripción activa institucional
```

### Renovación y fallas

```
Día 0: Flow intenta cobrar automáticamente
Si falla:
  Día 0: status → GRACE_PERIOD, Flow reintenta
  Día 1: si sigue sin pago → status → SUSPENDED
Si éxito:
  Webhook actualiza → ACTIVE, nueva period_end
```

---

## PARTE 6: Integración con Flow

### Configuración

```
Flow API Base URL: https://www.flow.cl/api
Flow Sandbox URL: https://sandbox.flow.cl/api
```

Variables de entorno backend:
```
FLOW_API_KEY=...
FLOW_SECRET_KEY=...
FLOW_API_URL=https://sandbox.flow.cl/api  # cambiar a www.flow.cl en producción
FLOW_RETURN_URL=https://aproba.ai/dashboard
FLOW_WEBHOOK_URL=https://[backend-railway-url]/api/payments/webhook
```

### Endpoints nuevos

#### Payments (`/api/payments`) — Requieren JWT excepto webhook

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| GET | `/subscription` | JWT | Estado actual de suscripción del profesor |
| POST | `/create-subscription` | JWT | Crear suscripción en Flow → retorna URL de pago |
| POST | `/webhook` | No (firma Flow) | Recibir notificaciones de Flow |
| POST | `/cancel` | JWT | Cancelar suscripción |

### Seguridad del webhook

- Validar firma HMAC-SHA256 con `FLOW_SECRET_KEY`
- Manejar idempotencia (mismo evento puede llegar múltiples veces)
- Registrar todos los eventos en logs para debugging

### Tarjetas de prueba Flow (sandbox)

- Éxito: `4051 8856 0044 6623`, CVV `123`, cualquier fecha futura
- Fallo: `4111 1111 1111 1111`

---

## PARTE 7: Seguridad de Cuentas

### 7.1 Recuperación de contraseña

```
1. Profesor ingresa email en /forgot-password
2. Backend genera reset_token (UUID) + reset_token_exp (1 hora)
3. Envía email con link: /reset-password?token=xxx
4. Profesor ingresa nueva contraseña
5. Backend verifica token + expiración → actualiza password_hash
6. Limpia reset_token y reset_token_exp
```

Endpoints nuevos en `/api/auth`:

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| POST | `/forgot-password` | No | Enviar email de recuperación |
| POST | `/reset-password` | No | Cambiar contraseña con token |
| PUT | `/change-password` | JWT | Cambiar contraseña (requiere contraseña actual) |

### 7.2 Validación de email

- Al registrarse, `is_verified = false`
- Se envía email con link de verificación (token temporal)
- Click en link → `is_verified = true`
- Usuarios no verificados pueden acceder pero ven banner "Verifica tu email"
- NO bloquear acceso por no verificar (es molesto), solo mostrar reminder

### 7.3 Rate limiting en login

- Máximo 5 intentos fallidos por email en 15 minutos
- Después del límite → responder con error genérico y bloquear temporalmente
- Usar in-memory store (Map) o Redis si escala
- Resetear contador al login exitoso

### 7.4 Cambio de contraseña

- Endpoint `PUT /api/auth/change-password`
- Requiere JWT + contraseña actual
- Valida contraseña actual con bcrypt antes de actualizar
- No invalida JWTs existentes (simplificación por ahora)

---

## PARTE 8: Middleware de Verificación

### `subscriptionMiddleware.ts`

Se aplica a endpoints que requieren suscripción activa. Verificar en este orden:

```typescript
async function requireActiveSubscription(req, res, next) {
  const teacher = await getTeacherWithSubscription(req.teacherId);

  // 1. Beta users bypass subscription check (but NOT usage tracking — that's separate)
  if (teacher.is_beta) return next();

  // 2. Check institutional subscription
  if (teacher.institution_id) {
    const instSub = await getInstitutionSubscription(teacher.institution_id);
    if (instSub?.status === 'ACTIVE' || instSub?.status === 'GRACE_PERIOD') {
      return next();
    }
    return res.status(403).json({ error: 'subscription_required', message: '...' });
  }

  // 3. Check personal subscription
  const sub = teacher.subscription;
  if (!sub) {
    return res.status(403).json({ error: 'subscription_required' });
  }

  // 4. Update status if needed (check grace period)
  await updateSubscriptionStatus(sub);

  if (sub.status === 'ACTIVE' || sub.status === 'GRACE_PERIOD') {
    return next();
  }

  return res.status(403).json({ error: 'subscription_suspended' });
}
```

### `usageLimitMiddleware.ts`

**Dos funciones separadas: tracking (siempre) y bloqueo (solo no-beta).**

```typescript
// TRACKING: Se ejecuta SIEMPRE (incluso beta) para registrar uso real
async function trackAttemptUsage(teacherId: string) {
  await incrementAttemptCounter(teacherId);
}

async function trackPdfAnalysisUsage(teacherId: string) {
  await incrementPdfAnalysisCounter(teacherId);
}

// BLOQUEO: Se ejecuta SOLO si no es beta
async function checkAttemptsLimit(req, res, next) {
  const teacher = await getTeacher(req.teacherId);
  if (teacher.is_beta) return next(); // beta: no bloquear
  const usage = await getCurrentUsage(teacher.id);
  if (usage.student_attempts >= 500) {
    return res.status(403).json({ error: 'attempts_limit_reached', ... });
  }
  return next();
}

async function checkPdfAnalysisLimit(req, res, next) {
  const teacher = await getTeacher(req.teacherId);
  if (teacher.is_beta) return next(); // beta: no bloquear
  const usage = await getCurrentUsage(teacher.id);
  if (usage.pdf_analyses >= 50) {
    return res.status(403).json({ error: 'pdf_analysis_limit_reached', ... });
  }
  return next();
}
```

### ¿Dónde aplicar cada middleware?

| Endpoint | Subscription | Track Usage | Block if Limit |
|----------|-------------|-------------|----------------|
| `POST /api/tests` (crear prueba) | ✅ | No | No |
| `POST /api/tests/:id/activate` | ✅ | No | ✅ checkAttemptsLimit* |
| `POST /api/tests/:id/analyze-pdf` | ✅ | ✅ trackPdfAnalysis | ✅ checkPdfAnalysisLimit |
| `POST /api/tests/:id/analyze-rubric` | ✅ | ✅ trackPdfAnalysis | ✅ checkPdfAnalysisLimit |
| `POST /api/student/join` | No** | ✅ trackAttemptUsage | ✅ checkAttemptsLimit*** |
| `GET /api/tests` (listar) | No | No | No |
| `GET /api/tests/:id/results` | No | No | No |

*Al activar, verifica que el profesor no esté ya al límite (pero no incrementa — eso pasa cuando entran estudiantes).
**El estudiante no tiene JWT, pero se trackea e incrementa el contador del profesor dueño de la prueba.
***Se verifica el límite del profesor dueño. Si está al límite, el estudiante no puede unirse.

**Orden de ejecución:** Verificar límite primero (solo si no es beta), luego Track/incrementar (SIEMPRE, para todas las cuentas). Así no se registra un intento que fue rechazado.

---

## PARTE 9: Frontend

### Página `/planes`

- Mostrar plan personal: $8.990/mes
- Botón "Suscribirse" → llama a `/api/payments/create-subscription`
- Redirige a Flow
- Diseño simple, sin comparativas complejas (solo un plan)

### Componente `SubscriptionBanner`

- Se muestra en el dashboard/navbar
- Estados: sin suscripción, activa, grace period, suspendida
- Colores: verde (activa), amarillo (grace), rojo (suspendida), gris (sin plan)

### Bloqueo en frontend

- Al intentar crear prueba sin suscripción → modal explicativo con botón a `/planes`
- Al intentar activar prueba sin intentos → modal con conteo de uso
- El backend SIEMPRE valida (frontend es solo UX, no seguridad)

### Página de uso `/dashboard/usage` (opcional, puede ser sección en dashboard)

- Mostrar: "420/500 intentos usados este mes"
- Mostrar: "12/50 análisis de PDF usados este mes"
- Barra de progreso visual

---

## PARTE 10: Cuentas Institucionales (Manual)

### Flujo para crear cuentas de un colegio

1. Crear `Institution` en la BD (manual o desde panel admin futuro)
2. Crear `InstitutionSubscription` con fechas de vigencia
3. Por cada profesor: crear `Teacher` con `institution_id`, `is_verified: true`
4. Generar contraseña temporal o token de reset
5. Enviar email con instrucciones: "Tu cuenta de Aproba está lista. Ingresa a [link] para establecer tu contraseña."

### Script o endpoint admin para crear cuentas

```typescript
// POST /api/admin/institution/create-teachers (requiere JWT admin)
// Body: { institution_id, teachers: [{ name, email }] }
// Crear Teacher con institution_id, generar reset_token, enviar email
```

Por ahora esto puede ser un script de Node.js que se corre manualmente. Panel admin es futuro.

---

## PARTE 11: Testing

### Checklist de pruebas

- [ ] Registro nuevo usuario → puede ver dashboard → NO puede crear prueba
- [ ] Sin suscripción intenta crear prueba → redirige a /planes
- [ ] Selecciona plan → redirige a Flow → paga → vuelve → puede crear prueba
- [ ] Beta (`is_beta: true`) → puede crear sin pago, sin límites de bloqueo
- [ ] Beta → UsageCounter se incrementa igual (verificar que registra uso)
- [ ] Institucional → puede crear si InstitutionSubscription está ACTIVE
- [ ] Falla pago → 1 día grace → día 2 suspendido
- [ ] Suspendido → puede ver datos → NO puede crear/activar prueba
- [ ] Pago exitoso después de suspensión → reactiva automáticamente
- [ ] Webhook de Flow actualiza correctamente
- [ ] Webhook idempotente (mismo evento 2 veces no duplica)
- [ ] 500 intentos → pruebas activas siguen → no puede activar nuevas
- [ ] 50 análisis PDF → no puede analizar más → puede usar pruebas existentes
- [ ] Forgot password → email → link → nueva contraseña funciona
- [ ] Rate limit login: 6to intento en 15 min → bloqueado
- [ ] Cambio de contraseña desde perfil funciona

---

## Orden de Implementación Sugerido

### Fase 1: Modelo de datos (base para todo)
- Migración Prisma con nuevas tablas y campos
- Seed con datos beta (tu cuenta `is_beta: true`)

### Fase 2: Seguridad de cuentas
- Forgot/reset password
- Change password
- Email verification
- Rate limiting en login

### Fase 3: Instituciones
- CRUD básico de instituciones
- Script para crear cuentas de profesores vinculadas
- Email de bienvenida con reset password

### Fase 4: Middleware de suscripción
- `subscriptionMiddleware` aplicado a endpoints relevantes
- Lógica: beta bypass → institucional → personal
- Frontend: modales de bloqueo y redirección a /planes

### Fase 5: Límites de uso
- `UsageCounter` y middleware de verificación
- Incremento atómico en `POST /student/join` y `POST /analyze-pdf`
- Frontend: visualización de uso en dashboard

### Fase 6: Integración Flow
- Configuración SDK/API de Flow
- Endpoint crear suscripción → redirect a Flow
- Webhook para recibir confirmaciones
- Validación de firma

### Fase 7: Frontend de pagos
- Página /planes
- Banner de estado de suscripción
- Flujo completo: sin plan → pagar → activo

### Fase 8: Grace period y suspensión
- Lógica de transición de estados
- Verificación al login / acceder dashboard
- Re-activación automática al pagar

### Fase 9: Testing completo
- Probar con tarjetas sandbox de Flow
- Todos los escenarios del checklist

---

## Notas Importantes

1. **NO implementar plan anual por ahora.** Solo mensual para simplificar.
2. **El precio incluye IVA.** $8.990 y $6.990 son lo que paga el usuario.
3. **Flow maneja reintentos automáticos** de cobro. El backend solo reacciona a webhooks.
4. **Cuentas beta no tienen límites de bloqueo** pero SÍ registran uso. El `UsageCounter` se incrementa siempre para todas las cuentas. Solo el bloqueo se salta para beta.
5. **La suspensión nunca borra datos.** Solo bloquea crear/activar pruebas.
6. **Cada fase debe ser funcional independientemente.** No depender de fases posteriores.
