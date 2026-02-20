// Servicio de Tests - Lógica de negocio para pruebas
import prisma from '../../config/database';
import { TestStatus, QuestionType } from '../../../generated/prisma';
import { uploadPDF } from '../../config/storage';
import { analyzeDocument, analyzeRubric as analyzeRubricAI } from '../../config/openai';
import { calculateChileanGrade, calculateGradeStats } from '../../utils/gradeCalculator';
import { extractTextFromPDF } from '../../utils/pdfExtractor';


// Tipos para las operaciones
export interface CreateTestData {
  title: string;
  teacherId: string;
  courseId?: string;
}

export interface UpdateTestData {
  title?: string;
  courseId?: string;
  // Opciones de corrección
  requireFalseJustification?: boolean;
  falseJustificationPenalty?: number;
  evaluateSpelling?: boolean;
  evaluateWriting?: boolean;
  spellingPoints?: number | null;
  writingPoints?: number | null;
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
    console.log(`\n🔄 INICIANDO CORRECCIÓN EN BACKGROUND para test: ${testId}`);
    try {
      const { correctionService } = require('../correction/correction.service');
      correctionService.correctTest(testId)
        .then((result: any) => {
          console.log(`✅ CORRECCIÓN COMPLETADA para test ${testId}:`, result);
        })
        .catch((err: any) => {
          console.error(`❌ ERROR en corrección de test ${testId}:`, err);
        });
    } catch (err) {
      console.error('❌ Error loading correction service:', err);
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
        // Opciones de corrección
        require_false_justification: data.requireFalseJustification,
        false_justification_penalty: data.falseJustificationPenalty,
        evaluate_spelling: data.evaluateSpelling,
        evaluate_writing: data.evaluateWriting,
        spelling_points: data.spellingPoints,
        writing_points: data.writingPoints,
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
  // El campo "number" de la IA puede ser string ("I.a") o número
  const questionLabel = q.number !== undefined ? String(q.number) : String(i + 1);
  const created = await prisma.question.create({
    data: {
      test_id: testId,
      question_number: i + 1, // Orden secuencial para ordenamiento
      question_label: questionLabel, // Nomenclatura visible (I.a, II.b, etc.)
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

    // Ejecutar corrección en BACKGROUND (no bloquea la respuesta)
    // La corrección continuará aunque el profesor cierre la página
    this.runCorrectionInBackground(testId);

    return closedTest;
  }

  /**
   * Enviar resultados por email a estudiantes seleccionados
   */
  async sendResults(
    testId: string,
    teacherId: string,
    studentAttemptIds?: string[],
    includeGrade: boolean = true
  ): Promise<{
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
    const passingThreshold = test.passing_threshold;

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
      const percentage = maxPoints > 0 ? (totalPoints / maxPoints) * 100 : 0;

      // Calcular nota si se debe incluir
      let gradeInfo: { grade: number; passed: boolean } | null = null;
      if (includeGrade) {
        const gradeResult = calculateChileanGrade(percentage, passingThreshold);
        gradeInfo = { grade: gradeResult.grade, passed: gradeResult.passed };
      }

      const result = {
        studentName: attempt.student_name,
        studentEmail: email,
        testTitle: test.title,
        courseName: test.course ? `${test.course.name} (${test.course.year})` : 'Sin curso',
        totalPoints: Math.round(totalPoints * 100) / 100,
        maxPoints,
        percentage: Math.round(percentage * 100) / 100,
        submittedAt: attempt.submitted_at?.toISOString() || new Date().toISOString(),
        // Información de nota (opcional)
        grade: gradeInfo?.grade,
        passed: gradeInfo?.passed,
        passingThreshold: includeGrade ? passingThreshold : undefined,
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
    const passingThreshold = test.passing_threshold;

    const summaryData: any[][] = [
      ['Resumen de Resultados'],
      [],
      ['Prueba', test.title],
      ['Curso', test.course ? `${test.course.name} (${test.course.year})` : 'Sin curso'],
      ['Total preguntas', test.questions.length],
      ['Puntaje máximo', maxPossiblePoints],
      ['Exigencia', `${passingThreshold}%`],
      [],
      ['Estudiante', 'Puntaje', 'Porcentaje', 'Nota', 'Estado', 'Ortografía', 'Redacción', 'Intentos Paste'],
    ];

    // Calcular estadísticas
    const scores: number[] = [];
    const grades: number[] = [];

    for (const attempt of attempts) {
      const total = attempt.answers.reduce((sum, a) => sum + (Number(a.points_earned) || 0), 0);
      const percentage = maxPossiblePoints > 0 ? (total / maxPossiblePoints) * 100 : 0;

      // Calcular nota usando la función de cálculo chileno
      const gradeResult = calculateChileanGrade(percentage, passingThreshold);

      summaryData.push([
        attempt.student_name,
        Math.round(total * 100) / 100,
        `${Math.round(percentage * 100) / 100}%`,
        gradeResult.grade,
        gradeResult.passed ? 'Aprobado' : 'Reprobado',
        attempt.spelling_score !== null ? Number(attempt.spelling_score) : '-',
        attempt.writing_score !== null ? Number(attempt.writing_score) : '-',
        attempt.paste_attempts || 0,
      ]);

      scores.push(total);
      grades.push(gradeResult.grade);
    }

    // Estadísticas generales
    const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    const maxScore = scores.length > 0 ? Math.max(...scores) : 0;
    const minScore = scores.length > 0 ? Math.min(...scores) : 0;
    const gradeStats = calculateGradeStats(grades);

    summaryData.push([]);
    summaryData.push(['Estadísticas']);
    summaryData.push(['Total estudiantes', attempts.length]);
    summaryData.push(['Promedio puntaje', Math.round(avgScore * 100) / 100]);
    summaryData.push(['Puntaje máximo obtenido', maxScore]);
    summaryData.push(['Puntaje mínimo obtenido', minScore]);
    summaryData.push(['Promedio notas', gradeStats.average]);
    summaryData.push(['Nota máxima', gradeStats.max]);
    summaryData.push(['Nota mínima', gradeStats.min]);
    summaryData.push(['Aprobados', `${gradeStats.passedCount} (${gradeStats.passRate}%)`]);
    summaryData.push(['Reprobados', gradeStats.failedCount]);

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
    const passingThreshold = test.passing_threshold;

    const studentsWithScores = attempts.map(attempt => {
      const totalPoints = attempt.answers.reduce((sum, a) => sum + (Number(a.points_earned) || 0), 0);
      const percentage = maxPossiblePoints > 0 ? (totalPoints / maxPossiblePoints) * 100 : 0;

      // Calcular nota chilena
      const gradeResult = calculateChileanGrade(percentage, passingThreshold);

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
        grade: gradeResult.grade,
        passed: gradeResult.passed,
        // Nuevos campos de evaluación
        spellingScore: attempt.spelling_score !== null ? Number(attempt.spelling_score) : null,
        writingScore: attempt.writing_score !== null ? Number(attempt.writing_score) : null,
        spellingWritingFeedback: attempt.spelling_writing_feedback,
        pasteAttempts: attempt.paste_attempts,
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
          justification: a.justification,
          pointsEarned: a.points_earned !== null ? Number(a.points_earned) : null,
          aiFeedback: a.ai_feedback,
        })),
      };
    });

    // Calcular estadísticas generales
    const scores = studentsWithScores.map(s => s.totalPoints);
    const grades = studentsWithScores.map(s => s.grade);
    const gradeStats = calculateGradeStats(grades);

    const summary = {
      totalStudents: studentsWithScores.length,
      averageScore: scores.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100 : 0,
      maxScore: scores.length > 0 ? Math.max(...scores) : 0,
      minScore: scores.length > 0 ? Math.min(...scores) : 0,
      maxPossiblePoints,
      reviewedCount: studentsWithScores.filter(s => s.reviewedAt).length,
      sentCount: studentsWithScores.filter(s => s.resultsSentAt).length,
      // Estadísticas de notas
      averageGrade: gradeStats.average,
      maxGrade: gradeStats.max,
      minGrade: gradeStats.min,
      passedCount: gradeStats.passedCount,
      failedCount: gradeStats.failedCount,
      passRate: gradeStats.passRate,
    };

    return {
      test: {
        id: test.id,
        title: test.title,
        status: test.status,
        course: test.course,
        questionsCount: test.questions.length,
        closedAt: test.closed_at,
        passingThreshold,
        correctionCompletedAt: test.correction_completed_at,
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
   * Actualizar la exigencia (porcentaje mínimo para nota 4.0)
   */
  async updatePassingThreshold(testId: string, teacherId: string, passingThreshold: number) {
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

    // Validar rango de exigencia (50-70%)
    if (passingThreshold < 50 || passingThreshold > 70) {
      throw new Error('La exigencia debe estar entre 50% y 70%');
    }

    // Actualizar la exigencia
    const updatedTest = await prisma.test.update({
      where: { id: testId },
      data: {
        passing_threshold: passingThreshold,
      },
    });

    return {
      success: true,
      passingThreshold: updatedTest.passing_threshold,
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
            options: question.options ?? undefined,
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
      question_label?: string;
      question_text?: string;
      type?: QuestionType;
      points?: number;
      correct_answer?: string;
      options?: string[];
      correction_criteria?: string;
      require_units?: boolean;
      unit_penalty?: number;
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
   * Crear una nueva pregunta manualmente
   */
  async createQuestion(
    testId: string,
    teacherId: string,
    data: {
      question_label?: string;
      question_text: string;
      type: QuestionType;
      points?: number;
      options?: string[];
      correct_answer?: string;
      correction_criteria?: string;
    }
  ) {
    // Verificar que la prueba pertenezca al profesor
    const test = await this.getTestById(testId, teacherId);

    // Verificar que la prueba esté en borrador
    if (test.status !== 'DRAFT') {
      throw new Error('Solo se pueden agregar preguntas a pruebas en borrador');
    }

    // Obtener el último número de pregunta
    const lastQuestion = await prisma.question.findFirst({
      where: { test_id: testId },
      orderBy: { question_number: 'desc' },
    });

    const nextNumber = (lastQuestion?.question_number || 0) + 1;

    // Crear la pregunta
    const newQuestion = await prisma.question.create({
      data: {
        test_id: testId,
        question_number: nextNumber,
        question_label: data.question_label || String(nextNumber),
        question_text: data.question_text,
        type: data.type,
        points: data.points || 1,
        options: data.options ?? undefined,
        correct_answer: data.correct_answer || null,
        correction_criteria: data.correction_criteria || null,
      },
    });

    return newQuestion;
  }

  /**
   * Reordenar preguntas
   */
  async reorderQuestions(
    testId: string,
    teacherId: string,
    questionIds: string[]
  ) {
    // Verificar que la prueba pertenezca al profesor
    const test = await this.getTestById(testId, teacherId);

    // Verificar que la prueba esté en borrador
    if (test.status !== 'DRAFT') {
      throw new Error('Solo se pueden reordenar preguntas en pruebas en borrador');
    }

    // Primero asignar números temporales negativos para evitar conflictos de unique constraint
    for (let i = 0; i < questionIds.length; i++) {
      await prisma.question.update({
        where: { id: questionIds[i] },
        data: { question_number: -(i + 1) },
      });
    }

    // Luego asignar los números correctos
    for (let i = 0; i < questionIds.length; i++) {
      await prisma.question.update({
        where: { id: questionIds[i] },
        data: { question_number: i + 1 },
      });
    }

    // Devolver las preguntas reordenadas
    const questions = await prisma.question.findMany({
      where: { test_id: testId },
      orderBy: { question_number: 'asc' },
    });

    return questions;
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

    // Reordenar las preguntas restantes
    const remainingQuestions = await prisma.question.findMany({
      where: { test_id: testId },
      orderBy: { question_number: 'asc' },
    });

    for (let i = 0; i < remainingQuestions.length; i++) {
      await prisma.question.update({
        where: { id: remainingQuestions[i].id },
        data: { question_number: i + 1 },
      });
    }

    return { message: 'Pregunta eliminada correctamente' };
  }

  /**
   * Analizar pauta de corrección PDF y retornar sugerencias para cada pregunta
   */
  async analyzeRubric(testId: string, teacherId: string, fileBuffer: Buffer) {
    // Verificar que la prueba pertenece al profesor
    const test = await this.getTestById(testId, teacherId);

    // Verificar que la prueba tenga preguntas
    const questions = await prisma.question.findMany({
      where: { test_id: testId },
      orderBy: { question_number: 'asc' },
    });

    if (questions.length === 0) {
      throw new Error('La prueba no tiene preguntas para mapear con la pauta');
    }

    // Extraer texto del PDF
    const rubricText = await extractTextFromPDF(fileBuffer);

    if (!rubricText || rubricText.trim().length === 0) {
      throw new Error('No se pudo extraer texto del PDF de pauta');
    }

    // Subir PDF a Supabase Storage
    const timestamp = Date.now();
    const fileName = `rubrics/${testId}_${timestamp}.pdf`;
    const rubricPdfUrl = await uploadPDF(fileBuffer, fileName);

    // Guardar URL en el Test
    await prisma.test.update({
      where: { id: testId },
      data: { rubric_pdf_url: rubricPdfUrl },
    });

    // Preparar preguntas para el análisis
    const questionsForAI = questions.map(q => ({
      id: q.id,
      question_number: q.question_number,
      question_label: q.question_label,
      type: q.type,
      question_text: q.question_text,
      points: Number(q.points),
    }));

    // Analizar con IA
    const suggestions = await analyzeRubricAI(rubricText, questionsForAI);

    return {
      message: `Pauta analizada. Se encontraron sugerencias para ${suggestions.filter(s => s.correct_answer !== null || s.correction_criteria !== null).length} de ${questions.length} preguntas`,
      rubricPdfUrl,
      suggestions,
    };
  }

  /**
   * Actualizar múltiples preguntas en batch (para aplicar pauta)
   */
  async batchUpdateQuestions(
    testId: string,
    teacherId: string,
    updates: Array<{ questionId: string; data: Record<string, any> }>
  ) {
    // Verificar ownership
    await this.getTestById(testId, teacherId);

    const results = [];
    for (const update of updates) {
      const { questionId, data } = update;

      // Verificar que la pregunta pertenece al test
      const question = await prisma.question.findFirst({
        where: { id: questionId, test_id: testId },
      });

      if (!question) {
        continue; // Saltar preguntas que no existen
      }

      // Construir datos de actualización (solo campos válidos)
      const updateData: Record<string, any> = {};
      if (data.correct_answer !== undefined) updateData.correct_answer = data.correct_answer;
      if (data.correction_criteria !== undefined) updateData.correction_criteria = data.correction_criteria;
      if (data.points !== undefined) updateData.points = data.points;
      if (data.require_units !== undefined) updateData.require_units = data.require_units;
      if (data.unit_penalty !== undefined) updateData.unit_penalty = data.unit_penalty;

      if (Object.keys(updateData).length > 0) {
        const updated = await prisma.question.update({
          where: { id: questionId },
          data: updateData,
        });
        results.push(updated);
      }
    }

    return {
      message: `${results.length} pregunta(s) actualizada(s)`,
      updated: results.length,
    };
  }
}

// Exportar instancia única del servicio
export const testsService = new TestsService();
