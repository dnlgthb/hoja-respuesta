// Servicio de Tests - Lógica de negocio para pruebas
import prisma from '../../config/database';
import { TestStatus, QuestionType } from '../../../generated/prisma';
import { uploadPDF } from '../../config/storage';
import { analyzeDocument } from '../../config/openai';
const { extractTextFromPDF } = require('../../utils/pdfExtractor');


// Tipos para las operaciones
export interface CreateTestData {
  title: string;
  teacherId: string;
  courseId?: string;
}

export interface UpdateTestData {
  title?: string;
  courseId?: string;
}

export class TestsService {
  
  /**
   * Crear una nueva prueba (estado: DRAFT)
   */
  async createTest(data: CreateTestData) {
    const { title, teacherId, courseId } = data;

    // Si se proporciona courseId, verificar que pertenezca al profesor
    if (courseId) {
      const course = await prisma.course.findFirst({
        where: {
          id: courseId,
          teacher_id: teacherId,
        },
      });
      if (!course) {
        throw new Error('Curso no encontrado o no pertenece al profesor');
      }
    }

    const test = await prisma.test.create({
      data: {
        title,
        teacher_id: teacherId,
        course_id: courseId || null,
        status: TestStatus.DRAFT,
      },
      include: {
        teacher: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        course: {
          select: {
            id: true,
            name: true,
            year: true,
          },
        },
        _count: {
          select: {
            questions: true,
            student_attempts: true,
          },
        },
      },
    });

    return test;
  }
  
  /**
   * Listar todas las pruebas de un profesor
   */
  async getTestsByTeacher(teacherId: string) {
    // Primero, cerrar automáticamente las pruebas expiradas
    const now = new Date();
    const expiredTests = await prisma.test.findMany({
      where: {
        teacher_id: teacherId,
        status: TestStatus.ACTIVE,
        ends_at: {
          lt: now,
        },
      },
    });

    // Cerrar cada prueba expirada
    for (const test of expiredTests) {
      await prisma.test.update({
        where: { id: test.id },
        data: {
          status: TestStatus.CLOSED,
          closed_at: now,
        },
      });

      // Marcar intentos en progreso como entregados
      await prisma.studentAttempt.updateMany({
        where: {
          test_id: test.id,
          status: 'IN_PROGRESS',
        },
        data: {
          status: 'SUBMITTED',
          submitted_at: now,
        },
      });

      // Disparar corrección en background
      this.runCorrectionInBackground(test.id);
    }

    // Ahora obtener todas las pruebas con el estado actualizado
    const tests = await prisma.test.findMany({
      where: {
        teacher_id: teacherId,
      },
      include: {
        course: {
          select: {
            id: true,
            name: true,
            year: true,
          },
        },
        _count: {
          select: {
            questions: true,
            student_attempts: true,
          },
        },
      },
      orderBy: {
        created_at: 'desc',
      },
    });

    return tests;
  }

  /**
   * Ejecutar corrección en background (sin bloquear)
   */
  private runCorrectionInBackground(testId: string) {
    try {
      const { correctionService } = require('../correction/correction.service');
      correctionService.correctTest(testId).catch((err: any) => {
        console.error(`Error correcting test ${testId}:`, err);
      });
    } catch (err) {
      console.error('Error loading correction service:', err);
    }
  }
  
  /**
   * Obtener una prueba por ID
   */
  async getTestById(testId: string, teacherId: string) {
    const test = await prisma.test.findFirst({
      where: {
        id: testId,
        teacher_id: teacherId, // Solo puede ver sus propias pruebas
      },
      include: {
        teacher: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        course: {
          include: {
            students: {
              orderBy: {
                student_name: 'asc',
              },
            },
          },
        },
        questions: {
          orderBy: {
            question_number: 'asc',
          },
        },
        _count: {
          select: {
            student_attempts: true,
          },
        },
      },
    });

    if (!test) {
      throw new Error('Prueba no encontrada');
    }

    return test;
  }
  
  /**
   * Actualizar una prueba
   */
  async updateTest(testId: string, teacherId: string, data: UpdateTestData) {
    // Verificar que la prueba pertenece al profesor
    const existingTest = await prisma.test.findFirst({
      where: {
        id: testId,
        teacher_id: teacherId,
      },
    });

    if (!existingTest) {
      throw new Error('Prueba no encontrada');
    }

    // No permitir editar pruebas activas o cerradas
    if (existingTest.status !== TestStatus.DRAFT) {
      throw new Error('Solo se pueden editar pruebas en borrador');
    }

    // Si se proporciona courseId, verificar que pertenezca al profesor
    if (data.courseId) {
      const course = await prisma.course.findFirst({
        where: {
          id: data.courseId,
          teacher_id: teacherId,
        },
      });
      if (!course) {
        throw new Error('Curso no encontrado o no pertenece al profesor');
      }
    }

    const updatedTest = await prisma.test.update({
      where: { id: testId },
      data: {
        title: data.title,
        course_id: data.courseId !== undefined ? data.courseId : undefined,
      },
      include: {
        course: {
          select: {
            id: true,
            name: true,
            year: true,
          },
        },
        _count: {
          select: {
            questions: true,
            student_attempts: true,
          },
        },
      },
    });

    return updatedTest;
  }
  
  /**
   * Eliminar una prueba
   */
  async deleteTest(testId: string, teacherId: string) {
    // Verificar que la prueba pertenece al profesor
    const existingTest = await prisma.test.findFirst({
      where: {
        id: testId,
        teacher_id: teacherId,
      },
    });
    
    if (!existingTest) {
      throw new Error('Prueba no encontrada');
    }
    
    // No permitir eliminar pruebas con estudiantes que ya respondieron
    const attemptsCount = await prisma.studentAttempt.count({
      where: {
        test_id: testId,
        status: 'SUBMITTED',
      },
    });
    
    if (attemptsCount > 0) {
      throw new Error('No se puede eliminar una prueba con respuestas entregadas');
    }
    
    // Eliminar la prueba (Cascade eliminará preguntas y intentos automáticamente)
    await prisma.test.delete({
      where: { id: testId },
    });
    
    return { message: 'Prueba eliminada exitosamente' };
  }
  
  /**
   * Subir PDF a Supabase y guardar URL en la prueba
   */
  async uploadTestPDF(testId: string, teacherId: string, fileBuffer: Buffer, originalName: string) {
    // Verificar que la prueba pertenece al profesor
    const test = await this.getTestById(testId, teacherId);
    
    // Solo se puede subir PDF a pruebas en borrador
    if (test.status !== TestStatus.DRAFT) {
      throw new Error('Solo se puede subir PDF a pruebas en borrador');
    }
    
    // Generar nombre único para el archivo
    const timestamp = Date.now();
    const fileName = `test-${testId}-${timestamp}.pdf`;
    
    // Subir a Supabase Storage
    const pdfUrl = await uploadPDF(fileBuffer, fileName);
    
    // Actualizar URL en la base de datos
    const updatedTest = await prisma.test.update({
      where: { id: testId },
      data: { pdf_url: pdfUrl },
      include: {
        _count: {
          select: {
            questions: true,
            student_attempts: true,
          },
        },
      },
    });
    
    return updatedTest;
  }
  
  /**
   * Analizar PDF con IA y crear preguntas automáticamente
   */
  async analyzePDF(testId: string, teacherId: string, fileBuffer: Buffer) {
    // Verificar que la prueba pertenece al profesor
    const test = await this.getTestById(testId, teacherId);
    
    // Extraer texto del PDF
    const pdfText = await extractTextFromPDF(fileBuffer);
    
    if (!pdfText || pdfText.trim().length === 0) {
      throw new Error('No se pudo extraer texto del PDF');
    }
    
    // Analizar con OpenAI
    const questions = await analyzeDocument(pdfText);
    
    if (!questions || questions.length === 0) {
      throw new Error('No se pudieron detectar preguntas en el PDF');
    }
    // Eliminar preguntas existentes (si las hay)
await prisma.question.deleteMany({
  where: { test_id: testId },
});

// Crear preguntas secuencialmente para evitar race conditions
const createdQuestions = [];
for (let i = 0; i < questions.length; i++) {
  const q = questions[i];
  const created = await prisma.question.create({
    data: {
      test_id: testId,
      question_number: i + 1,
      type: q.type as QuestionType,
      question_text: q.text,
      points: q.points || 1,
      options: q.options || null,
      correct_answer: null,
      correction_criteria: null,
    },
  });
  createdQuestions.push(created);
}
    
    return {
      message: `Se detectaron ${createdQuestions.length} preguntas`,
      questions: createdQuestions,
    };
  }
  
  /**
   * Verificar si una prueba pertenece a un profesor
   */
  async verifyTestOwnership(testId: string, teacherId: string): Promise<boolean> {
    const test = await prisma.test.findFirst({
      where: {
        id: testId,
        teacher_id: teacherId,
      },
    });
    
    return test !== null;
  }
  /**
   * Activar una prueba (genera código de acceso y cambia estado a ACTIVE)
   */
  async activateTest(testId: string, teacherId: string, durationMinutes: number) {
    // Importar la función de generación de código
    const { generateUniqueAccessCode } = require('../../utils/generateCode');

    // Validar duración
    if (!durationMinutes || durationMinutes < 1 || durationMinutes > 480) {
      throw new Error('La duración debe ser entre 1 y 480 minutos');
    }

    // Verificar que la prueba pertenece al profesor
    const test = await this.getTestById(testId, teacherId);

    // Verificar que esté en estado DRAFT
    if (test.status !== TestStatus.DRAFT) {
      throw new Error('Solo se pueden activar pruebas en borrador');
    }

    // NOTA: Se permite tener múltiples pruebas activas simultáneamente

    // Verificar que tenga un curso asignado
    if (!test.course_id) {
      throw new Error('La prueba debe tener un curso asignado para ser activada');
    }

    // Verificar que tenga al menos una pregunta
    if (test.questions.length === 0) {
      throw new Error('La prueba debe tener al menos una pregunta para ser activada');
    }

    // Verificar que tenga PDF subido
    if (!test.pdf_url) {
      throw new Error('La prueba debe tener un PDF subido para ser activada');
    }

    // Generar código único de 6 caracteres
    const checkCodeExists = async (code: string) => {
      const existing = await prisma.test.findUnique({
        where: { access_code: code },
      });
      return existing !== null;
    };

    const accessCode = await generateUniqueAccessCode(checkCodeExists);

    // Calcular tiempo de finalización
    const activatedAt = new Date();
    const endsAt = new Date(activatedAt.getTime() + durationMinutes * 60 * 1000);

    // Activar la prueba
    const activatedTest = await prisma.test.update({
      where: { id: testId },
      data: {
        status: TestStatus.ACTIVE,
        access_code: accessCode,
        duration_minutes: durationMinutes,
        activated_at: activatedAt,
        ends_at: endsAt,
      },
      include: {
        course: {
          select: {
            id: true,
            name: true,
            year: true,
          },
        },
        _count: {
          select: {
            questions: true,
            student_attempts: true,
          },
        },
      },
    });

    return activatedTest;
  }

  /**
   * Cerrar una prueba manualmente (cambia estado a CLOSED)
   */
  async closeTest(testId: string, teacherId: string) {
    // Verificar que la prueba pertenece al profesor
    const test = await prisma.test.findFirst({
      where: {
        id: testId,
        teacher_id: teacherId,
      },
    });

    if (!test) {
      throw new Error('Prueba no encontrada');
    }

    // Verificar que esté en estado ACTIVE
    if (test.status !== TestStatus.ACTIVE) {
      throw new Error('Solo se pueden cerrar pruebas activas');
    }

    // Cerrar la prueba
    const closedTest = await prisma.test.update({
      where: { id: testId },
      data: {
        status: TestStatus.CLOSED,
        closed_at: new Date(),
      },
      include: {
        course: {
          select: {
            id: true,
            name: true,
            year: true,
          },
        },
        _count: {
          select: {
            questions: true,
            student_attempts: true,
          },
        },
      },
    });

    // Marcar todos los intentos en progreso como entregados automáticamente
    await prisma.studentAttempt.updateMany({
      where: {
        test_id: testId,
        status: 'IN_PROGRESS',
      },
      data: {
        status: 'SUBMITTED',
        submitted_at: new Date(),
      },
    });

    // Disparar corrección automática (en background para no bloquear)
    this.runCorrection(testId).catch(err => {
      console.error('Error running correction:', err);
    });

    return closedTest;
  }

  /**
   * Enviar resultados por email a estudiantes seleccionados
   */
  async sendResults(testId: string, teacherId: string, studentAttemptIds?: string[]): Promise<{
    sent: number;
    failed: number;
    errors: string[];
  }> {
    const { sendResultsEmail } = require('../../config/email');

    // Verificar que la prueba pertenece al profesor
    const test = await prisma.test.findFirst({
      where: {
        id: testId,
        teacher_id: teacherId,
      },
      include: {
        course: {
          select: {
            name: true,
            year: true,
          },
        },
      },
    });

    if (!test) {
      throw new Error('Prueba no encontrada');
    }

    // Verificar que la prueba esté cerrada
    if (test.status !== 'CLOSED') {
      throw new Error('La prueba debe estar cerrada para enviar resultados');
    }

    // Obtener los intentos a enviar
    const whereClause: any = {
      test_id: testId,
      status: 'SUBMITTED',
    };

    if (studentAttemptIds && studentAttemptIds.length > 0) {
      whereClause.id = { in: studentAttemptIds };
    }

    const attempts = await prisma.studentAttempt.findMany({
      where: whereClause,
      include: {
        answers: {
          include: {
            question: true,
          },
          orderBy: {
            question: {
              question_number: 'asc',
            },
          },
        },
        course_student: {
          select: {
            student_email: true,
          },
        },
      },
    });

    // Calcular puntaje máximo
    const questions = await prisma.question.findMany({
      where: { test_id: testId },
    });
    const maxPoints = questions.reduce((sum, q) => sum + Number(q.points), 0);

    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    // Enviar email a cada estudiante
    for (const attempt of attempts) {
      const email = attempt.student_email || attempt.course_student?.student_email;

      if (!email) {
        failed++;
        errors.push(`${attempt.student_name}: No tiene email registrado`);
        continue;
      }

      const totalPoints = attempt.answers.reduce((sum, a) => sum + (Number(a.points_earned) || 0), 0);

      const result = {
        studentName: attempt.student_name,
        studentEmail: email,
        testTitle: test.title,
        courseName: test.course ? `${test.course.name} (${test.course.year})` : 'Sin curso',
        totalPoints: Math.round(totalPoints * 100) / 100,
        maxPoints,
        percentage: Math.round((totalPoints / maxPoints) * 10000) / 100,
        submittedAt: attempt.submitted_at?.toISOString() || new Date().toISOString(),
        answers: attempt.answers.map(a => ({
          questionNumber: a.question.question_number,
          questionText: a.question.question_text,
          questionType: a.question.type,
          answerValue: a.answer_value,
          correctAnswer: a.question.correct_answer,
          pointsEarned: a.points_earned !== null ? Number(a.points_earned) : null,
          maxPoints: Number(a.question.points),
          aiFeedback: a.ai_feedback,
        })),
      };

      const emailResult = await sendResultsEmail(result);

      if (emailResult.success) {
        // Marcar como enviado
        await prisma.studentAttempt.update({
          where: { id: attempt.id },
          data: { results_sent_at: new Date() },
        });
        sent++;
      } else {
        failed++;
        errors.push(`${attempt.student_name}: ${emailResult.error}`);
      }
    }

    return { sent, failed, errors };
  }

  /**
   * Exportar resultados a Excel
   */
  async exportResults(testId: string, teacherId: string): Promise<Buffer> {
    const XLSX = require('xlsx');

    // Verificar que la prueba pertenece al profesor
    const test = await prisma.test.findFirst({
      where: {
        id: testId,
        teacher_id: teacherId,
      },
      include: {
        questions: {
          orderBy: { question_number: 'asc' },
        },
        course: {
          select: {
            name: true,
            year: true,
          },
        },
      },
    });

    if (!test) {
      throw new Error('Prueba no encontrada');
    }

    // Obtener todos los intentos con sus respuestas
    const attempts = await prisma.studentAttempt.findMany({
      where: {
        test_id: testId,
        status: 'SUBMITTED',
      },
      include: {
        answers: {
          include: {
            question: {
              select: {
                question_number: true,
                points: true,
              },
            },
          },
        },
      },
      orderBy: {
        student_name: 'asc',
      },
    });

    const maxPossiblePoints = test.questions.reduce((sum, q) => sum + Number(q.points), 0);

    // ============================================
    // HOJA 1: Matriz de puntajes
    // ============================================
    const matrixData: any[][] = [];

    // Header: Nombre, P1, P2, P3..., Total, %
    const header = [
      'Estudiante',
      ...test.questions.map(q => `P${q.question_number}`),
      'Total',
      '%',
    ];
    matrixData.push(header);

    // Fila de puntajes máximos
    const maxRow = [
      'Puntaje máximo',
      ...test.questions.map(q => Number(q.points)),
      maxPossiblePoints,
      '100%',
    ];
    matrixData.push(maxRow);

    // Fila para cada estudiante
    for (const attempt of attempts) {
      const answerMap = new Map(
        attempt.answers.map(a => [a.question.question_number, Number(a.points_earned) || 0])
      );

      const studentRow: any[] = [attempt.student_name];

      let total = 0;
      for (const question of test.questions) {
        const points = answerMap.get(question.question_number) || 0;
        studentRow.push(points);
        total += points;
      }

      const percentage = maxPossiblePoints > 0 ? Math.round((total / maxPossiblePoints) * 10000) / 100 : 0;
      studentRow.push(Math.round(total * 100) / 100);
      studentRow.push(`${percentage}%`);

      matrixData.push(studentRow);
    }

    // ============================================
    // HOJA 2: Resumen
    // ============================================
    const summaryData: any[][] = [
      ['Resumen de Resultados'],
      [],
      ['Prueba', test.title],
      ['Curso', test.course ? `${test.course.name} (${test.course.year})` : 'Sin curso'],
      ['Total preguntas', test.questions.length],
      ['Puntaje máximo', maxPossiblePoints],
      [],
      ['Estudiante', 'Puntaje', 'Porcentaje', 'Nota (escala 1-7)'],
    ];

    // Calcular estadísticas
    const scores: number[] = [];

    for (const attempt of attempts) {
      const total = attempt.answers.reduce((sum, a) => sum + (Number(a.points_earned) || 0), 0);
      const percentage = maxPossiblePoints > 0 ? (total / maxPossiblePoints) * 100 : 0;

      // Calcular nota en escala 1-7 (60% = 4.0)
      let nota: number;
      if (percentage >= 60) {
        nota = 4.0 + ((percentage - 60) / 40) * 3;
      } else {
        nota = 1.0 + (percentage / 60) * 3;
      }
      nota = Math.round(nota * 10) / 10;

      summaryData.push([
        attempt.student_name,
        Math.round(total * 100) / 100,
        `${Math.round(percentage * 100) / 100}%`,
        nota,
      ]);

      scores.push(total);
    }

    // Estadísticas generales
    const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    const maxScore = scores.length > 0 ? Math.max(...scores) : 0;
    const minScore = scores.length > 0 ? Math.min(...scores) : 0;

    summaryData.push([]);
    summaryData.push(['Estadísticas']);
    summaryData.push(['Total estudiantes', attempts.length]);
    summaryData.push(['Promedio', Math.round(avgScore * 100) / 100]);
    summaryData.push(['Puntaje máximo obtenido', maxScore]);
    summaryData.push(['Puntaje mínimo obtenido', minScore]);

    // Crear workbook
    const workbook = XLSX.utils.book_new();

    // Agregar hoja de matriz
    const matrixSheet = XLSX.utils.aoa_to_sheet(matrixData);
    XLSX.utils.book_append_sheet(workbook, matrixSheet, 'Puntajes');

    // Agregar hoja de resumen
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Resumen');

    // Generar buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    return buffer;
  }

  /**
   * Ejecutar corrección en background
   */
  private async runCorrection(testId: string) {
    const { correctionService } = require('../correction/correction.service');

    try {
      console.log(`Starting correction for test ${testId}...`);
      const result = await correctionService.correctTest(testId);
      console.log(`Correction completed for test ${testId}:`, result);
    } catch (error) {
      console.error(`Error correcting test ${testId}:`, error);
    }
  }
  /**
   * Obtener resultados completos de una prueba
   */
  async getTestResults(testId: string, teacherId: string) {
    // Verificar que la prueba pertenece al profesor
    const test = await prisma.test.findFirst({
      where: {
        id: testId,
        teacher_id: teacherId,
      },
      include: {
        questions: {
          orderBy: { question_number: 'asc' },
        },
        course: {
          select: {
            id: true,
            name: true,
            year: true,
          },
        },
      },
    });

    if (!test) {
      throw new Error('Prueba no encontrada');
    }

    // Obtener todos los intentos con sus respuestas
    const attempts = await prisma.studentAttempt.findMany({
      where: {
        test_id: testId,
        status: 'SUBMITTED',
      },
      include: {
        answers: {
          include: {
            question: {
              select: {
                id: true,
                question_number: true,
                question_text: true,
                type: true,
                points: true,
                correct_answer: true,
                correction_criteria: true,
              },
            },
          },
          orderBy: {
            question: {
              question_number: 'asc',
            },
          },
        },
        course_student: {
          select: {
            student_email: true,
          },
        },
      },
      orderBy: {
        student_name: 'asc',
      },
    });

    // Calcular estadísticas
    const maxPossiblePoints = test.questions.reduce((sum, q) => sum + Number(q.points), 0);

    const studentsWithScores = attempts.map(attempt => {
      const totalPoints = attempt.answers.reduce((sum, a) => sum + (Number(a.points_earned) || 0), 0);
      const percentage = maxPossiblePoints > 0 ? (totalPoints / maxPossiblePoints) * 100 : 0;

      return {
        id: attempt.id,
        studentName: attempt.student_name,
        studentEmail: attempt.student_email || attempt.course_student?.student_email || null,
        resultsToken: attempt.results_token,
        submittedAt: attempt.submitted_at,
        reviewedAt: attempt.reviewed_at,
        resultsSentAt: attempt.results_sent_at,
        totalPoints: Math.round(totalPoints * 100) / 100, // Redondear a 2 decimales
        maxPoints: maxPossiblePoints,
        percentage: Math.round(percentage * 100) / 100,
        answers: attempt.answers.map(a => ({
          id: a.id,
          questionId: a.question_id,
          questionNumber: a.question.question_number,
          questionText: a.question.question_text,
          questionType: a.question.type,
          maxPoints: Number(a.question.points),
          correctAnswer: a.question.correct_answer,
          correctionCriteria: a.question.correction_criteria,
          answerValue: a.answer_value,
          pointsEarned: a.points_earned !== null ? Number(a.points_earned) : null,
          aiFeedback: a.ai_feedback,
        })),
      };
    });

    // Calcular estadísticas generales
    const scores = studentsWithScores.map(s => s.totalPoints);
    const summary = {
      totalStudents: studentsWithScores.length,
      averageScore: scores.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100 : 0,
      maxScore: scores.length > 0 ? Math.max(...scores) : 0,
      minScore: scores.length > 0 ? Math.min(...scores) : 0,
      maxPossiblePoints,
      reviewedCount: studentsWithScores.filter(s => s.reviewedAt).length,
      sentCount: studentsWithScores.filter(s => s.resultsSentAt).length,
    };

    return {
      test: {
        id: test.id,
        title: test.title,
        status: test.status,
        course: test.course,
        questionsCount: test.questions.length,
        closedAt: test.closed_at,
      },
      students: studentsWithScores,
      summary,
    };
  }

  /**
   * Actualizar una respuesta específica (edición manual de puntaje/feedback)
   */
  async updateAnswer(
    testId: string,
    answerId: string,
    teacherId: string,
    data: { pointsEarned?: number; aiFeedback?: string }
  ) {
    // Verificar que la prueba pertenece al profesor
    const test = await prisma.test.findFirst({
      where: {
        id: testId,
        teacher_id: teacherId,
      },
    });

    if (!test) {
      throw new Error('Prueba no encontrada');
    }

    // Verificar que la respuesta pertenece a esta prueba
    const answer = await prisma.answer.findFirst({
      where: {
        id: answerId,
        student_attempt: {
          test_id: testId,
        },
      },
      include: {
        question: true,
      },
    });

    if (!answer) {
      throw new Error('Respuesta no encontrada');
    }

    // Validar que los puntos no excedan el máximo y sean enteros
    let pointsToSave: number | undefined;
    if (data.pointsEarned !== undefined) {
      const maxPoints = Number(answer.question.points);
      // Redondear a entero
      pointsToSave = Math.round(data.pointsEarned);
      if (pointsToSave < 0 || pointsToSave > maxPoints) {
        throw new Error(`Los puntos deben estar entre 0 y ${maxPoints}`);
      }
    }

    // Actualizar la respuesta
    const updatedAnswer = await prisma.answer.update({
      where: { id: answerId },
      data: {
        points_earned: pointsToSave !== undefined ? pointsToSave : undefined,
        ai_feedback: data.aiFeedback !== undefined ? data.aiFeedback : undefined,
      },
    });

    return updatedAnswer;
  }

  /**
   * Marcar un intento como revisado
   */
  async markAttemptReviewed(testId: string, attemptId: string, teacherId: string) {
    // Verificar que la prueba pertenece al profesor
    const test = await prisma.test.findFirst({
      where: {
        id: testId,
        teacher_id: teacherId,
      },
    });

    if (!test) {
      throw new Error('Prueba no encontrada');
    }

    // Verificar que el intento pertenece a esta prueba
    const attempt = await prisma.studentAttempt.findFirst({
      where: {
        id: attemptId,
        test_id: testId,
      },
    });

    if (!attempt) {
      throw new Error('Intento no encontrado');
    }

    // Marcar como revisado
    const updatedAttempt = await prisma.studentAttempt.update({
      where: { id: attemptId },
      data: {
        reviewed_at: new Date(),
      },
    });

    return {
      success: true,
      reviewedAt: updatedAttempt.reviewed_at,
    };
  }

  /**
   * Duplicar una prueba existente
   */
  async duplicateTest(testId: string, teacherId: string, newTitle?: string, newCourseId?: string) {
    // Verificar que la prueba pertenece al profesor
    const originalTest = await prisma.test.findFirst({
      where: {
        id: testId,
        teacher_id: teacherId,
      },
      include: {
        questions: {
          orderBy: { question_number: 'asc' },
        },
      },
    });

    if (!originalTest) {
      throw new Error('Prueba no encontrada');
    }

    // Si se proporciona courseId, verificar que pertenezca al profesor
    if (newCourseId) {
      const course = await prisma.course.findFirst({
        where: {
          id: newCourseId,
          teacher_id: teacherId,
        },
      });
      if (!course) {
        throw new Error('Curso no encontrado o no pertenece al profesor');
      }
    }

    // Crear la nueva prueba (siempre en estado DRAFT)
    const duplicatedTest = await prisma.test.create({
      data: {
        title: newTitle || `${originalTest.title} (copia)`,
        teacher_id: teacherId,
        course_id: newCourseId || null,
        pdf_url: originalTest.pdf_url, // Mantener el mismo PDF
        status: TestStatus.DRAFT,
      },
      include: {
        course: {
          select: {
            id: true,
            name: true,
            year: true,
          },
        },
        _count: {
          select: {
            questions: true,
            student_attempts: true,
          },
        },
      },
    });

    // Duplicar las preguntas
    if (originalTest.questions.length > 0) {
      for (const question of originalTest.questions) {
        await prisma.question.create({
          data: {
            test_id: duplicatedTest.id,
            question_number: question.question_number,
            type: question.type,
            question_text: question.question_text,
            points: question.points,
            options: question.options || null,
            correct_answer: question.correct_answer,
            correction_criteria: question.correction_criteria,
          },
        });
      }
    }

    // Recargar para incluir las preguntas duplicadas
    const finalTest = await prisma.test.findUnique({
      where: { id: duplicatedTest.id },
      include: {
        course: {
          select: {
            id: true,
            name: true,
            year: true,
          },
        },
        questions: {
          orderBy: { question_number: 'asc' },
        },
        _count: {
          select: {
            questions: true,
            student_attempts: true,
          },
        },
      },
    });

    return finalTest;
  }

  /**
   * Actualizar una pregunta específica
   */
  async updateQuestion(
    testId: string,
    questionId: string,
    teacherId: string,
    updates: {
      question_text?: string;
      type?: QuestionType;
      points?: number;
      correct_answer?: string;
      options?: string[];
      correction_criteria?: string;
    }
  ) {
    // Verificar que la prueba pertenezca al profesor
    const test = await this.getTestById(testId, teacherId);
    
    // Verificar que la pregunta pertenezca a la prueba
    const question = await prisma.question.findFirst({
      where: {
        id: questionId,
        test_id: testId,
      },
    });
    
    if (!question) {
      throw new Error('Pregunta no encontrada');
    }
    
    // Actualizar la pregunta
    const updatedQuestion = await prisma.question.update({
      where: { id: questionId },
      data: updates,
    });
    
    return updatedQuestion;
  }

  /**
   * Eliminar una pregunta específica
   */
  async deleteQuestion(testId: string, questionId: string, teacherId: string) {
    // Verificar que la prueba pertenezca al profesor
    const test = await this.getTestById(testId, teacherId);
    
    // Verificar que la pregunta pertenezca a la prueba
    const question = await prisma.question.findFirst({
      where: {
        id: questionId,
        test_id: testId,
      },
    });
    
    if (!question) {
      throw new Error('Pregunta no encontrada');
    }
    
    // Eliminar la pregunta
    await prisma.question.delete({
      where: { id: questionId },
    });
    
    return { message: 'Pregunta eliminada correctamente' };
  }
}

// Exportar instancia única del servicio
export const testsService = new TestsService();
