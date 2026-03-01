// Servicio de Corrección - Lógica de corrección automática y con IA
import prisma from '../../config/database';
import { QuestionType } from '../../../generated/prisma';
import {
  correctWithAI,
  correctTrueFalseWithJustification,
  correctMathWithUnits,
  evaluateSpellingAndWriting,
} from '../../config/openai';

/**
 * Normalizar respuesta de Verdadero/Falso
 * Acepta: v, V, verdadero, VERDADERO, true, TRUE, f, F, falso, FALSO, false, FALSE
 */
function normalizeTrueFalse(value: string): string | null {
  const normalized = value.trim().toLowerCase();

  // Verdadero
  if (['v', 'verdadero', 'true', 'verdadera', 'si', 'sí', 's'].includes(normalized)) {
    return 'V';
  }

  // Falso
  if (['f', 'falso', 'false', 'falsa', 'no', 'n'].includes(normalized)) {
    return 'F';
  }

  return null; // No reconocido
}

/**
 * Normalizar respuesta de alternativa múltiple
 * Acepta: a, A, a), A), (a), (A), a., A., etc.
 */
function normalizeMultipleChoice(value: string): string | null {
  const normalized = value.trim().toLowerCase();

  // Extraer solo la letra (a-z)
  const match = normalized.match(/^[\(\[]?([a-z])[\)\]\.\,\-]?$/);
  if (match) {
    return match[1].toUpperCase();
  }

  // Si es solo una letra
  if (normalized.length === 1 && /^[a-z]$/.test(normalized)) {
    return normalized.toUpperCase();
  }

  return null; // No reconocido
}

/**
 * Comparar respuestas normalizando según el tipo de pregunta
 */
function compareAnswers(studentAnswer: string, correctAnswer: string, questionType: QuestionType): boolean {
  if (questionType === QuestionType.TRUE_FALSE) {
    const normalizedStudent = normalizeTrueFalse(studentAnswer);
    const normalizedCorrect = normalizeTrueFalse(correctAnswer);

    if (normalizedStudent === null || normalizedCorrect === null) {
      // Fallback a comparación directa si no se puede normalizar
      return studentAnswer.trim().toUpperCase() === correctAnswer.trim().toUpperCase();
    }

    return normalizedStudent === normalizedCorrect;
  }

  if (questionType === QuestionType.MULTIPLE_CHOICE) {
    const normalizedStudent = normalizeMultipleChoice(studentAnswer);
    const normalizedCorrect = normalizeMultipleChoice(correctAnswer);

    if (normalizedStudent === null || normalizedCorrect === null) {
      // Fallback a comparación directa si no se puede normalizar
      return studentAnswer.trim().toUpperCase() === correctAnswer.trim().toUpperCase();
    }

    return normalizedStudent === normalizedCorrect;
  }

  // Para otros tipos, comparación directa
  return studentAnswer.trim().toUpperCase() === correctAnswer.trim().toUpperCase();
}

export class CorrectionService {

  /**
   * Corregir preguntas automáticas (TRUE_FALSE y MULTIPLE_CHOICE)
   * Se ejecuta cuando la prueba se cierra
   */
  async correctAutomaticQuestions(testId: string): Promise<{ corrected: number; total: number }> {
    // Obtener la prueba para verificar configuración de justificación
    const test = await prisma.test.findUnique({
      where: { id: testId },
      select: {
        require_false_justification: true,
        false_justification_penalty: true,
        correction_strictness: true,
      },
    });

    // Obtener todas las preguntas de la prueba que son automáticas
    const questions = await prisma.question.findMany({
      where: {
        test_id: testId,
        type: {
          in: [QuestionType.TRUE_FALSE, QuestionType.MULTIPLE_CHOICE],
        },
      },
    });

    if (questions.length === 0) {
      return { corrected: 0, total: 0 };
    }

    // Crear mapa de preguntas para acceso rápido
    const questionMap = new Map(questions.map(q => [q.id, q]));

    // Obtener todas las respuestas de estudiantes para estas preguntas
    const answers = await prisma.answer.findMany({
      where: {
        question_id: {
          in: questions.map(q => q.id),
        },
        points_earned: null, // Solo las que no han sido corregidas
      },
      include: {
        student_attempt: {
          select: {
            status: true,
          },
        },
      },
    });

    // Filtrar solo respuestas de intentos SUBMITTED
    const submittedAnswers = answers.filter(a => a.student_attempt.status === 'SUBMITTED');

    console.log(`\n📝 Corrigiendo ${submittedAnswers.length} respuestas automáticas...`);
    console.log(`   require_false_justification: ${test?.require_false_justification}`);

    let corrected = 0;

    // Corregir cada respuesta
    for (const answer of submittedAnswers) {
      const question = questionMap.get(answer.question_id);
      if (!question || !question.correct_answer) {
        console.log(`   ⚠️ Pregunta ${answer.question_id} sin respuesta correcta, saltando...`);
        continue;
      }

      // Comparar respuesta usando normalización según tipo de pregunta
      const studentAnswer = answer.answer_value || '';
      const correctAnswer = question.correct_answer;

      console.log(`\n   📋 Pregunta: ${question.question_text?.substring(0, 30)}...`);
      console.log(`      Tipo: ${question.type}`);
      console.log(`      Respuesta correcta: ${correctAnswer}`);
      console.log(`      Respuesta estudiante: ${studentAnswer}`);
      console.log(`      Justificación: ${answer.justification || '(ninguna)'}`);
      console.log(`      Pauta (correction_criteria): ${question.correction_criteria || '(ninguna)'}`);

      // Verificar si necesita corrección con IA para justificación de V/F
      const needsJustificationCorrection =
        question.type === QuestionType.TRUE_FALSE &&
        test?.require_false_justification &&
        normalizeTrueFalse(studentAnswer) === 'F' &&
        normalizeTrueFalse(correctAnswer) === 'F';

      console.log(`      needsJustificationCorrection: ${needsJustificationCorrection}`);

      if (needsJustificationCorrection) {
        // Corregir V/F con justificación usando IA
        console.log(`      🤖 Llamando a correctTrueFalseWithJustification...`);
        try {
          const result = await correctTrueFalseWithJustification({
            questionText: question.question_text,
            correctAnswer: correctAnswer,
            studentAnswer: studentAnswer,
            justification: answer.justification,
            correctionCriteria: question.correction_criteria,
            maxPoints: Number(question.points),
            penaltyPercentage: test.false_justification_penalty,
            strictness: test.correction_strictness,
          });

          await prisma.answer.update({
            where: { id: answer.id },
            data: {
              points_earned: Math.min(result.pointsEarned, Number(question.points)),
              ai_feedback: result.feedback,
            },
          });
        } catch (error) {
          console.error(`Error correcting V/F with justification for answer ${answer.id}:`, error);
          // Fallback: corrección simple sin justificación
          const isCorrect = compareAnswers(studentAnswer, correctAnswer, question.type);
          await prisma.answer.update({
            where: { id: answer.id },
            data: {
              points_earned: isCorrect ? Number(question.points) : 0,
              ai_feedback: 'Error en corrección de justificación. Requiere revisión manual.',
            },
          });
        }
      } else {
        // Corrección automática simple
        const isCorrect = compareAnswers(studentAnswer, correctAnswer, question.type);
        const pointsEarned = isCorrect ? Number(question.points) : 0;

        await prisma.answer.update({
          where: { id: answer.id },
          data: {
            points_earned: pointsEarned,
            ai_feedback: isCorrect ? 'Respuesta correcta' : `Respuesta incorrecta. La respuesta correcta era: ${question.correct_answer}`,
          },
        });
      }

      corrected++;
    }

    return { corrected, total: submittedAnswers.length };
  }

  /**
   * Corregir preguntas con IA (DEVELOPMENT y MATH)
   * Se ejecuta después de la corrección automática
   */
  async correctAIQuestions(testId: string): Promise<{ corrected: number; total: number }> {
    // Obtener configuración de unidades del test
    const test = await prisma.test.findUnique({
      where: { id: testId },
      select: {
        require_units: true,
        unit_penalty: true,
        correction_strictness: true,
      },
    });

    // Obtener todas las preguntas de la prueba que requieren IA
    const questions = await prisma.question.findMany({
      where: {
        test_id: testId,
        type: {
          in: [QuestionType.DEVELOPMENT, QuestionType.MATH],
        },
      },
    });

    if (questions.length === 0) {
      return { corrected: 0, total: 0 };
    }

    // Crear mapa de preguntas para acceso rápido
    const questionMap = new Map(questions.map(q => [q.id, q]));

    // Obtener todas las respuestas de estudiantes para estas preguntas
    const answers = await prisma.answer.findMany({
      where: {
        question_id: {
          in: questions.map(q => q.id),
        },
        points_earned: null, // Solo las que no han sido corregidas
      },
      include: {
        student_attempt: {
          select: {
            status: true,
          },
        },
      },
    });

    // Filtrar solo respuestas de intentos SUBMITTED
    const submittedAnswers = answers.filter(a => a.student_attempt.status === 'SUBMITTED');

    console.log(`\n🤖 Corrigiendo ${submittedAnswers.length} respuestas con IA (MATH/DEVELOPMENT)...`);

    let corrected = 0;

    // Corregir cada respuesta con IA
    for (const answer of submittedAnswers) {
      const question = questionMap.get(answer.question_id);
      if (!question) continue;

      console.log(`\n   📋 Pregunta: ${question.question_text?.substring(0, 40)}...`);
      console.log(`      Tipo: ${question.type}`);
      console.log(`      Pauta (correction_criteria): ${question.correction_criteria || '(ninguna)'}`);
      console.log(`      Respuesta estudiante: ${answer.answer_value?.substring(0, 50) || '(vacía)'}...`);
      console.log(`      require_units: ${question.require_units}`);

      try {
        // Si no hay respuesta, asignar 0 puntos
        if (!answer.answer_value || answer.answer_value.trim() === '') {
          console.log(`      ⚠️ Sin respuesta, asignando 0 puntos`);
          await prisma.answer.update({
            where: { id: answer.id },
            data: {
              points_earned: 0,
              ai_feedback: 'No se proporcionó respuesta.',
            },
          });
          corrected++;
          continue;
        }

        let result: { pointsEarned: number; feedback: string };

        // Usar corrección específica para MATH con unidades si está habilitado
        // Check test-level require_units first, fallback to question-level for backward compat
        const requireUnits = test?.require_units ?? question.require_units;
        const unitPenalty = test?.require_units ? (test.unit_penalty ?? 0.5) : question.unit_penalty;

        if (question.type === QuestionType.MATH && requireUnits) {
          console.log(`      🤖 Llamando a correctMathWithUnits...`);
          result = await correctMathWithUnits({
            questionText: question.question_text,
            correctionCriteria: question.correction_criteria || '',
            maxPoints: Number(question.points),
            studentAnswer: answer.answer_value,
            requireUnits: requireUnits,
            unitPenalty: unitPenalty,
          });
        } else {
          console.log(`      🤖 Llamando a correctWithAI...`);
          // Llamar a la IA para corregir normalmente
          result = await correctWithAI({
            questionType: question.type as 'DEVELOPMENT' | 'MATH',
            questionText: question.question_text,
            correctionCriteria: question.correction_criteria || '',
            maxPoints: Number(question.points),
            studentAnswer: answer.answer_value,
            strictness: test?.correction_strictness,
          });
        }

        console.log(`      ✅ Resultado: ${result.pointsEarned} pts - ${result.feedback?.substring(0, 50)}...`);

        // Actualizar la respuesta con el resultado de la IA
        await prisma.answer.update({
          where: { id: answer.id },
          data: {
            points_earned: Math.min(result.pointsEarned, Number(question.points)), // Asegurar que no exceda el máximo
            ai_feedback: result.feedback,
          },
        });

        corrected++;
      } catch (error) {
        console.error(`Error correcting answer ${answer.id} with AI:`, error);
        // En caso de error, marcar para revisión manual
        await prisma.answer.update({
          where: { id: answer.id },
          data: {
            ai_feedback: 'Error en corrección automática. Requiere revisión manual.',
          },
        });
      }
    }

    return { corrected, total: submittedAnswers.length };
  }

  /**
   * Evaluar ortografía y redacción de todos los estudiantes
   * Se ejecuta una vez por estudiante, evaluando todas sus respuestas de desarrollo
   */
  async evaluateSpellingAndWritingForTest(testId: string): Promise<{ evaluated: number }> {
    // Obtener configuración de la prueba
    const test = await prisma.test.findUnique({
      where: { id: testId },
      select: {
        evaluate_spelling: true,
        evaluate_writing: true,
        spelling_points: true,
        writing_points: true,
      },
    });

    if (!test || (!test.evaluate_spelling && !test.evaluate_writing)) {
      return { evaluated: 0 };
    }

    // Obtener todas las preguntas de desarrollo de la prueba
    const developmentQuestions = await prisma.question.findMany({
      where: {
        test_id: testId,
        type: QuestionType.DEVELOPMENT,
      },
    });

    if (developmentQuestions.length === 0) {
      return { evaluated: 0 };
    }

    const questionIds = developmentQuestions.map(q => q.id);
    const questionMap = new Map(developmentQuestions.map(q => [q.id, q]));

    // Obtener todos los intentos SUBMITTED
    const attempts = await prisma.studentAttempt.findMany({
      where: {
        test_id: testId,
        status: 'SUBMITTED',
      },
      include: {
        answers: {
          where: {
            question_id: { in: questionIds },
          },
        },
      },
    });

    let evaluated = 0;

    for (const attempt of attempts) {
      // Recopilar respuestas de desarrollo del estudiante
      const studentAnswers = attempt.answers
        .filter(a => a.answer_value && a.answer_value.trim() !== '')
        .map(a => ({
          questionText: questionMap.get(a.question_id)?.question_text || '',
          answer: a.answer_value || '',
        }));

      if (studentAnswers.length === 0) {
        continue; // No hay respuestas de desarrollo para evaluar
      }

      try {
        const result = await evaluateSpellingAndWriting({
          answers: studentAnswers,
          evaluateSpelling: test.evaluate_spelling,
          evaluateWriting: test.evaluate_writing,
        });

        // Calcular puntajes (redondeado a 0.5)
        const roundToHalf = (n: number) => Math.round(n * 2) / 2;

        const spellingScore = test.evaluate_spelling && result.spellingLevel !== null
          ? roundToHalf((test.spelling_points || 0) * (result.spellingLevel / 100))
          : null;

        const writingScore = test.evaluate_writing && result.writingLevel !== null
          ? roundToHalf((test.writing_points || 0) * (result.writingLevel / 100))
          : null;

        // Guardar resultados en el intento
        await prisma.studentAttempt.update({
          where: { id: attempt.id },
          data: {
            spelling_score: spellingScore,
            writing_score: writingScore,
            spelling_writing_feedback: result.feedback || null,
          },
        });

        evaluated++;
      } catch (error) {
        console.error(`Error evaluating spelling/writing for attempt ${attempt.id}:`, error);
      }
    }

    return { evaluated };
  }

  /**
   * Ejecutar corrección completa de una prueba
   */
  async correctTest(testId: string): Promise<{
    automatic: { corrected: number; total: number };
    ai: { corrected: number; total: number };
    spellingWriting: { evaluated: number };
  }> {
    // Primero corregir las automáticas (rápido)
    const automaticResult = await this.correctAutomaticQuestions(testId);

    // Luego corregir con IA (más lento)
    const aiResult = await this.correctAIQuestions(testId);

    // Evaluar ortografía y redacción
    const spellingWritingResult = await this.evaluateSpellingAndWritingForTest(testId);

    // Marcar corrección como completada
    await prisma.test.update({
      where: { id: testId },
      data: {
        correction_completed_at: new Date(),
      },
    });

    console.log(`Correction completed for test ${testId} at ${new Date().toISOString()}`);

    return {
      automatic: automaticResult,
      ai: aiResult,
      spellingWriting: spellingWritingResult,
    };
  }

  /**
   * Verificar si la corrección de una prueba está completa
   */
  async isCorrectionComplete(testId: string): Promise<boolean> {
    const test = await prisma.test.findUnique({
      where: { id: testId },
      select: { correction_completed_at: true },
    });

    return test?.correction_completed_at !== null;
  }
}

// Exportar instancia única del servicio
export const correctionService = new CorrectionService();
