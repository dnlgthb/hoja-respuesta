// Servicio de Corrección - Lógica de corrección automática y con IA
import prisma from '../../config/database';
import { QuestionType } from '../../../generated/prisma';

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

    let corrected = 0;

    // Corregir cada respuesta
    for (const answer of submittedAnswers) {
      const question = questionMap.get(answer.question_id);
      if (!question || !question.correct_answer) continue;

      // Comparar respuesta usando normalización según tipo de pregunta
      const studentAnswer = answer.answer_value || '';
      const correctAnswer = question.correct_answer;

      const isCorrect = compareAnswers(studentAnswer, correctAnswer, question.type);
      const pointsEarned = isCorrect ? Number(question.points) : 0;

      // Actualizar la respuesta
      await prisma.answer.update({
        where: { id: answer.id },
        data: {
          points_earned: pointsEarned,
          ai_feedback: isCorrect ? 'Respuesta correcta' : `Respuesta incorrecta. La respuesta correcta era: ${question.correct_answer}`,
        },
      });

      corrected++;
    }

    return { corrected, total: submittedAnswers.length };
  }

  /**
   * Corregir preguntas con IA (DEVELOPMENT y MATH)
   * Se ejecuta después de la corrección automática
   */
  async correctAIQuestions(testId: string): Promise<{ corrected: number; total: number }> {
    // Importar función de corrección IA
    const { correctWithAI } = require('../../config/openai');

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

    let corrected = 0;

    // Corregir cada respuesta con IA
    for (const answer of submittedAnswers) {
      const question = questionMap.get(answer.question_id);
      if (!question) continue;

      try {
        // Si no hay respuesta, asignar 0 puntos
        if (!answer.answer_value || answer.answer_value.trim() === '') {
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

        // Llamar a la IA para corregir
        const result = await correctWithAI({
          questionType: question.type,
          questionText: question.question_text,
          correctionCriteria: question.correction_criteria || '',
          maxPoints: Number(question.points),
          studentAnswer: answer.answer_value,
        });

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
   * Ejecutar corrección completa de una prueba
   */
  async correctTest(testId: string): Promise<{
    automatic: { corrected: number; total: number };
    ai: { corrected: number; total: number };
  }> {
    // Primero corregir las automáticas (rápido)
    const automaticResult = await this.correctAutomaticQuestions(testId);

    // Luego corregir con IA (más lento)
    const aiResult = await this.correctAIQuestions(testId);

    return {
      automatic: automaticResult,
      ai: aiResult,
    };
  }
}

// Exportar instancia única del servicio
export const correctionService = new CorrectionService();
