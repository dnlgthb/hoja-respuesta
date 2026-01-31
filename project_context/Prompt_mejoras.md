\## OBJETIVO

Implementar mejoras al sistema de corrección de Aproba. Son 6 mejoras divididas en 5 pasos de implementación.



---



\## PASO 1: CAMBIOS EN BASE DE DATOS (SCHEMA)



Agregar los siguientes campos en Prisma:



\### En modelo Test (configuración a nivel de prueba):

\- requireFalseJustification: Boolean (default: false) → si V/F requiere justificar falsas

\- falseJustificationPenalty: Float (default: 0.5) → porcentaje de descuento (0.5 = 50%)

\- evaluateSpelling: Boolean (default: false) → evaluar ortografía

\- evaluateWriting: Boolean (default: false) → evaluar redacción

\- spellingPoints: Float? → puntaje asignado a ortografía

\- writingPoints: Float? → puntaje asignado a redacción



\### En modelo Question (configuración por pregunta matemática):

\- requireUnits: Boolean (default: false) → exigir unidades en respuesta

\- unitPenalty: Float (default: 0.5) → porcentaje de descuento si falta/está mal



\### En modelo StudentAttempt (registro de paste):

\- pasteAttempts: Int (default: 0) → contador de intentos de paste externo



\### En modelo Answer (para justificación de V/F):

\- justification: String? → texto de justificación para preguntas V/F



Ejecutar migración después de estos cambios.



---



\## PASO 2: AJUSTES A PROMPTS DE IA (BACKEND)



Modificar los prompts de corrección en el servicio correspondiente.



\### 2.1 Cambio global: Sin frases motivacionales



Agregar a TODOS los prompts de corrección esta instrucción:



    "IMPORTANTE: No incluyas frases motivacionales genéricas al final del feedback

    como '¡Sigue así!', '¡Buen intento!', '¡Ánimo!', '¡Excelente trabajo!'.

    Termina el feedback con información útil y específica sobre la respuesta."



\### 2.2 Prompt para V/F con justificación de falsas



Cuando requireFalseJustification=true y el estudiante marcó FALSO:



    "Esta es una pregunta de Verdadero/Falso donde el estudiante marcó FALSO.

 

    PREGUNTA: {questionText}

    RESPUESTA CORRECTA: {correctAnswer}

    RESPUESTA DEL ESTUDIANTE: Falso

    JUSTIFICACIÓN DEL ESTUDIANTE: {justification || 'No proporcionó justificación'}

 

    PAUTA DE JUSTIFICACIÓN (proporcionada por el profesor):

    {correctionCriteria || 'El estudiante debe explicar por qué la afirmación es falsa'}

 

    PUNTAJE MÁXIMO: {maxPoints} puntos

    PENALIZACIÓN POR JUSTIFICACIÓN INCORRECTA/AUSENTE: {falseJustificationPenalty \* 100}%

 

    INSTRUCCIONES:

    1. Si la respuesta V/F es incorrecta (era Verdadero) → 0 puntos

    2. Si la respuesta V/F es correcta (era Falso):

       - Si la justificación es correcta según la pauta → puntaje completo

       - Si la justificación es incorrecta o ausente → aplicar penalización

    3. El feedback debe explicar qué faltó o qué estuvo mal en la justificación

 

    Responde SOLO con JSON:

    { "pointsEarned": <número>, "feedback": "<texto>" }"



\### 2.3 Prompt para ortografía y redacción (evaluación global)



Crear un NUEVO endpoint o función que evalúe ortografía/redacción de forma global.

Se llama UNA vez por estudiante, no por pregunta.



    "Eres un evaluador de ortografía y redacción. Evalúa TODAS las respuestas

    de desarrollo de este estudiante en conjunto.

 

    RESPUESTAS DEL ESTUDIANTE:

    ---

    Pregunta 1: {questionText1}

    Respuesta: {answer1}

    ---

    Pregunta 2: {questionText2}

    Respuesta: {answer2}

    ---

    \[... todas las preguntas de desarrollo ...]

 

    EVALUAR ORTOGRAFÍA: {evaluateSpelling ? 'SÍ' : 'NO'}

    EVALUAR REDACCIÓN: {evaluateWriting ? 'SÍ' : 'NO'}

 

    CRITERIOS DE EVALUACIÓN:

    - Excelente (100%): Sin errores o errores mínimos que no afectan la lectura

    - Competente (75%): Pocos errores, no afectan comprensión

    - En desarrollo (50%): Varios errores que distraen al lector

    - Insuficiente (25%): Errores frecuentes que dificultan la comprensión

    - Muy deficiente (0%): Errores graves que impiden entender el texto

 

    INSTRUCCIONES:

    1. Evalúa el conjunto de respuestas, no cada una por separado

    2. Asigna un nivel (0, 25, 50, 75, o 100)

    3. El feedback DEBE ser específico:

       - Citar errores exactos encontrados

       - Mostrar la corrección para cada error

       - Dar ejemplos concretos de cómo mejorar la redacción

       - Mencionar en qué pregunta está cada error

 

    EJEMPLO DE FEEDBACK ESPECÍFICO:

    'Errores de ortografía: «atravez» → «a través» (pregunta 2), «enserio» → «en serio» (pregunta 4).

    Redacción: En la pregunta 2, la oración «El movimiento que fue causado por la fuerza que se aplicó»

    es redundante; mejor: «El movimiento fue causado por la fuerza aplicada».

    Evita oraciones de más de 30 palabras.'

 

    Responde SOLO con JSON:

    {

      "spellingLevel": <0|25|50|75|100 o null si no se evalúa>,

      "writingLevel": <0|25|50|75|100 o null si no se evalúa>,

      "feedback": "<texto específico con ejemplos>"

    }"



El puntaje final se calcula:

\- spellingPoints \* (spellingLevel / 100)

\- writingPoints \* (writingLevel / 100)



\### 2.4 Prompt para matemáticas con unidades



Cuando requireUnits=true en una pregunta MATH:



    Agregar al prompt existente de MATH:

 

    "EVALUACIÓN DE UNIDADES: ACTIVADA

    PENALIZACIÓN SI FALTA O ESTÁ INCORRECTA: {unitPenalty \* 100}%

 

    Debes evaluar si la respuesta incluye las unidades correctas.

    - Infiere la unidad esperada del contexto de la pregunta y la pauta

    - Si las unidades faltan o son incorrectas, aplica la penalización al puntaje

    - SIEMPRE menciona en el feedback si las unidades están correctas,

      faltan, o son incorrectas, y cuáles deberían ser"



---



\## PASO 3: UI DEL PROFESOR (FRONTEND)



\### 3.1 Configuración de prueba (al crear/editar prueba)



Agregar sección "Opciones de corrección" con:



    ┌─────────────────────────────────────────────────────────────┐

    │ OPCIONES DE CORRECCIÓN                                      │

    ├─────────────────────────────────────────────────────────────┤

    │ ☐ Requerir justificación en respuestas Falsas (V/F)        │

    │   └─ Descuento si no justifica o justifica mal: \[50]%      │

    │                                                             │

    │ ☐ Evaluar ortografía         Puntaje: \[\_\_\_] pts (X% total) │

    │ ☐ Evaluar redacción          Puntaje: \[\_\_\_] pts (X% total) │

    │                                                             │

    │ (Estas opciones aplican a todas las preguntas de desarrollo)│

    └─────────────────────────────────────────────────────────────┘



\- El "% total" se calcula automáticamente: (puntaje asignado / suma total de puntos) \* 100

\- Si no hay preguntas de desarrollo, mostrar nota: "No hay preguntas de desarrollo en esta prueba"



\### 3.2 Editor de preguntas V/F (cuando requireFalseJustification=true)



Agregar campo adicional en el editor de cada pregunta V/F:



    ┌─────────────────────────────────────────────────────────────┐

    │ Pregunta 1 - Verdadero/Falso                               │

    │ Enunciado: \[\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_]           │

    │ Respuesta correcta: ○ Verdadero  ● Falso                   │

    │ Puntaje: \[2] pts                                           │

    │                                                             │

    │ Pauta para justificación de Falso:                         │

    │ \[El estudiante debe mencionar que la Tierra tarda 365 días]│

    │ (Solo se usa si la respuesta correcta es Falso)            │

    └─────────────────────────────────────────────────────────────┘



\### 3.3 Editor de preguntas MATH



Agregar opciones de unidades:



    ┌─────────────────────────────────────────────────────────────┐

    │ Pregunta 3 - Matemática                                     │

    │ Enunciado: \[\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_]           │

    │ Puntaje: \[5] pts                                           │

    │ Pauta de corrección: \[\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_]       │

    │                                                             │

    │ ☐ Exigir unidades en la respuesta                          │

    │   └─ Descuento si faltan o están mal: \[50]%                │

    └─────────────────────────────────────────────────────────────┘



---



\## PASO 4: UI DEL ESTUDIANTE (FRONTEND)



\### 4.1 Campo de justificación para V/F



Cuando requireFalseJustification=true y el estudiante selecciona FALSO:



    ┌─────────────────────────────────────────────────────────────┐

    │ 1. La Tierra gira alrededor del Sol en 24 horas.           │

    │                                                             │

    │    ○ Verdadero   ● Falso                                   │

    │                                                             │

    │    Justifica tu respuesta:                                  │

    │    \[\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_]           │

    │    (Requerido para respuestas Falsas)                      │

    └─────────────────────────────────────────────────────────────┘



\- El campo de justificación aparece SOLO si selecciona Falso

\- Es obligatorio si está visible

\- Se guarda en Answer.justification



\### 4.2 Anti-copy/paste



Implementar en TODOS los campos de texto (textarea, input de respuesta):



    // Detectar paste

    const handlePaste = (e: React.ClipboardEvent) => {

      const pastedText = e.clipboardData.getData('text');

      const currentFieldText = e.currentTarget.value || '';

 

      // Permitir si el texto pegado viene del mismo campo

      // (el usuario cortó y pegó dentro del mismo campo)

      if (currentFieldText.includes(pastedText)) {

        return; // permitir

      }

 

      // Bloquear paste externo

      e.preventDefault();

 

      // Incrementar contador (llamar al backend)

      incrementPasteAttempt(attemptId);

    };



\- Crear endpoint: POST /api/student/attempt/:attemptId/paste-attempt

\- Este endpoint incrementa StudentAttempt.pasteAttempts en 1

\- No mostrar ningún mensaje al estudiante (silencioso)

\- El profesor verá el contador en los resultados



\### 4.3 Editor de expresiones matemáticas



Integrar MathLive (https://cortexjs.io/mathlive/) para preguntas MATH:



    npm install mathlive



Reemplazar el textarea normal por MathLive cuando question.type === 'MATH':



    import { MathfieldElement } from 'mathlive';

 

    // El estudiante puede escribir: fracciones, raíces, exponentes, etc.

    // Ejemplo: \\frac{1}{2}, \\sqrt{9}, x^2

 

    // Guardar el valor en LaTeX en Answer.answer\_value



\- Mostrar una barra de herramientas básica con: fracción, raíz cuadrada, exponente, subíndice, π, ±

\- El campo debe ser suficientemente alto para expresiones complejas



---



\## PASO 5: PÁGINA DE RESULTADOS



\### 5.1 Mostrar puntaje de ortografía/redacción separado



En la tabla de resultados por estudiante:



    ┌────────────────────────────────────────────────────────────────┐

    │ Resultados de: Juan Pérez                                      │

    ├────────────────────────────────────────────────────────────────┤

    │ Pregunta 1 (V/F): 2/2 pts                                      │

    │ Pregunta 2 (Desarrollo): 4/5 pts                               │

    │ Pregunta 3 (Matemática): 3/5 pts                               │

    │ ───────────────────────────────────────────────────────────    │

    │ Ortografía: 4/5 pts                                            │

    │ Redacción: 3/5 pts                                             │

    │ ───────────────────────────────────────────────────────────    │

    │ TOTAL: 16/22 pts (72.7%)                                       │

    │ NOTA: 5.2                                                      │

    │                                                                │

    │ 📋 Feedback de ortografía y redacción:                        │

    │ "Errores: «atravez» → «a través» (P2). Redacción: En P2,      │

    │ evitar oraciones de más de 30 palabras..."                     │

    │                                                                │

    │ ⚠️ Intentos de copiar/pegar texto externo: 3                  │

    └────────────────────────────────────────────────────────────────┘



\### 5.2 Incluir en descarga Excel



Agregar columnas:

\- "Ortografía" (puntaje)

\- "Redacción" (puntaje)

\- "Intentos paste" (número)



\### 5.3 Incluir en email a estudiantes (si corresponde)



El feedback de ortografía/redacción debe incluirse en los resultados enviados.



---



\## ORDEN DE IMPLEMENTACIÓN SUGERIDO



1\. PASO 1 completo (schema) → ejecutar migración

2\. PASO 2.1 (sin frases motivacionales) → probar

3\. PASO 3.1 y 3.2 (UI profesor para V/F) + PASO 4.1 (UI estudiante V/F) + PASO 2.2 (prompt V/F)

4\. PASO 3.1 (UI profesor ortografía) + PASO 2.3 (prompt ortografía) + PASO 5.1 (resultados)

5\. PASO 3.3 (UI profesor unidades) + PASO 2.4 (prompt unidades)

6\. PASO 4.2 (anti-paste)

7\. PASO 4.3 (MathLive)



Muéstrame el progreso después de cada paso antes de continuar con el siguiente.



---



\## ARCHIVOS PROBABLES



\- backend/prisma/schema.prisma

\- backend/src/modules/tests/tests.service.ts (prompts de corrección)

\- backend/src/modules/student/student.service.ts (paste attempts)

\- frontend/src/app/tests/\[id]/page.tsx (editor de prueba)

\- frontend/src/app/tests/\[id]/results/page.tsx (resultados)

\- frontend/src/app/prueba/\[attemptId]/page.tsx (interfaz estudiante)

\- frontend/package.json (agregar mathlive)



\## NO HAGAS

\- No implementes E6 (campo de desarrollo matemático) - está postergado

\- No modifiques la paleta de colores ni la identidad visual - eso es otro prompt

\- No cambies la lógica del botón "Ver resultados" - eso es otro prompt

