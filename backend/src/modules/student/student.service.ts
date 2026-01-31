// Servicio de Estudiantes - Lógica de negocio
import prisma from '../../config/database';

// Tipos
export interface JoinTestData {
  accessCode: string;
  courseStudentId: string;
  deviceToken?: string;
  studentEmail?: string;
}

export interface JoinTestResponse {
  attemptId: string;
  deviceToken: string;
  test: {
    id: string;
    title: string;
    pdfUrl: string | null;
    questions: Array<{
      id: string;
      questionNumber: number;
      type: string;
      questionText: string;
      points: number;
      options: unknown;
    }>;
  };
}

export interface AvailableStudentsResponse {
  test: {
    id: string;
    title: string;
    courseName: string;
  };
  students: Array<{
    id: string;
    studentName: string;
    hasAttempt: boolean;
    attemptStatus?: 'IN_PROGRESS' | 'SUBMITTED' | undefined;
  }>;
}

export interface SaveAnswersData {
  questionId: string;
  answerValue: string;
  justification?: string; // Para V/F con justificación
}

export class StudentService {

  /**
   * Verificar y cerrar pruebas expiradas automáticamente
   */
  private async checkAndCloseExpiredTest(test: any): Promise<boolean> {
    if (test.status !== 'ACTIVE' || !test.ends_at) {
      return false;
    }

    const now = new Date();
    const endsAt = new Date(test.ends_at);

    if (now > endsAt) {
      // La prueba ha expirado, cerrarla automáticamente
      await prisma.test.update({
        where: { id: test.id },
        data: {
          status: 'CLOSED',
          closed_at: now,
        },
      });

      // Marcar todos los intentos en progreso como entregados
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

      return true; // Prueba fue cerrada
    }

    return false;
  }

  /**
   * Ejecutar corrección en background (sin bloquear)
   */
  private async runCorrectionInBackground(testId: string) {
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
   * Obtener estudiantes disponibles para una prueba
   */
  async getAvailableStudents(accessCode: string): Promise<AvailableStudentsResponse> {
    // 1. Buscar test por access_code
    const test = await prisma.test.findUnique({
      where: { access_code: accessCode },
      include: {
        course: {
          include: {
            students: {
              orderBy: { student_name: 'asc' },
            },
          },
        },
      },
    });

    if (!test) {
      throw new Error('Código de prueba inválido');
    }

    // Verificar si la prueba ha expirado y cerrarla automáticamente
    const wasClosed = await this.checkAndCloseExpiredTest(test);
    if (wasClosed) {
      throw new Error('La prueba ha terminado (tiempo agotado)');
    }

    if (test.status !== 'ACTIVE') {
      throw new Error('La prueba no está activa');
    }

    if (!test.course) {
      throw new Error('Esta prueba no tiene un curso asociado');
    }

    // 2. Obtener intentos existentes para esta prueba
    const existingAttempts = await prisma.studentAttempt.findMany({
      where: { test_id: test.id },
      select: {
        course_student_id: true,
        status: true,
        is_unlocked: true,
      },
    });

    // Crear mapa de intentos por course_student_id
    const attemptMap = new Map(
      existingAttempts
        .filter(a => a.course_student_id && !a.is_unlocked)
        .map(a => [a.course_student_id, a.status])
    );

    // 3. Mapear estudiantes con su estado
    const students = test.course.students.map(student => ({
      id: student.id,
      studentName: student.student_name,
      hasAttempt: attemptMap.has(student.id),
      attemptStatus: attemptMap.get(student.id) as 'IN_PROGRESS' | 'SUBMITTED' | undefined,
    }));

    return {
      test: {
        id: test.id,
        title: test.title,
        courseName: test.course.name,
      },
      students,
    };
  }

  /**
   * Unirse a una prueba con código de acceso (usando lista cerrada)
   */
  async joinTest(data: JoinTestData): Promise<JoinTestResponse> {
    const { accessCode, courseStudentId, deviceToken, studentEmail } = data;

    // 1. Buscar test por access_code (debe estar ACTIVE)
    const test = await prisma.test.findUnique({
      where: { access_code: accessCode },
      include: {
        course: true,
        questions: {
          orderBy: { question_number: 'asc' },
          select: {
            id: true,
            question_number: true,
            question_label: true,
            type: true,
            question_text: true,
            points: true,
            options: true,
            // NO incluir correct_answer ni correction_criteria
          },
        },
      },
    });

    if (!test) {
      throw new Error('Código de prueba inválido');
    }

    if (test.status !== 'ACTIVE') {
      throw new Error('La prueba no está activa');
    }

    if (!test.course) {
      throw new Error('Esta prueba no tiene un curso asociado');
    }

    // 2. Validar que courseStudentId pertenezca al curso de la prueba
    const courseStudent = await prisma.courseStudent.findUnique({
      where: { id: courseStudentId },
    });

    if (!courseStudent) {
      throw new Error('Estudiante no encontrado');
    }

    if (courseStudent.course_id !== test.course_id) {
      throw new Error('El estudiante no pertenece al curso de esta prueba');
    }

    // 3. Si viene deviceToken, buscar intento existente
    if (deviceToken) {
      const existingAttempt = await prisma.studentAttempt.findUnique({
        where: { device_token: deviceToken },
        include: { answers: true },
      });

      if (existingAttempt && existingAttempt.test_id === test.id) {
        // Actualizar última actividad
        await prisma.studentAttempt.update({
          where: { id: existingAttempt.id },
          data: { last_activity_at: new Date() },
        });

        return this.formatJoinResponse(existingAttempt.id, deviceToken, test);
      }
    }

    // 4. Verificar si este estudiante ya tiene un intento (bloqueado)
    const existingByCourseStudent = await prisma.studentAttempt.findFirst({
      where: {
        test_id: test.id,
        course_student_id: courseStudentId,
      },
    });

    if (existingByCourseStudent) {
      if (existingByCourseStudent.is_unlocked) {
        // Si está desbloqueado, generar nuevo token y actualizar
        const newDeviceToken = crypto.randomUUID();
        const updatedAttempt = await prisma.studentAttempt.update({
          where: { id: existingByCourseStudent.id },
          data: {
            device_token: newDeviceToken,
            is_unlocked: false,
            last_activity_at: new Date(),
            // Actualizar email si el estudiante proporciona uno nuevo
            student_email: studentEmail || existingByCourseStudent.student_email,
          },
        });
        return this.formatJoinResponse(updatedAttempt.id, newDeviceToken, test);
      }
      throw new Error('Este estudiante ya tiene un intento activo. Contacta al profesor para desbloquear.');
    }

    // 5. Crear nuevo StudentAttempt
    const newDeviceToken = crypto.randomUUID();
    const resultsToken = crypto.randomUUID();

    // Usar email proporcionado por el estudiante, o el del curso como fallback
    const emailToUse = studentEmail || courseStudent.student_email || null;

    const newAttempt = await prisma.studentAttempt.create({
      data: {
        test_id: test.id,
        course_student_id: courseStudentId,
        student_name: courseStudent.student_name,
        student_email: emailToUse,
        device_token: newDeviceToken,
        results_token: resultsToken,
        status: 'IN_PROGRESS',
        last_activity_at: new Date(),
      },
    });

    return this.formatJoinResponse(newAttempt.id, newDeviceToken, test);
  }

  /**
   * Obtener intento con sus respuestas
   */
  async getAttempt(attemptId: string, deviceToken: string) {
    const attempt = await prisma.studentAttempt.findUnique({
      where: { id: attemptId },
      include: {
        answers: {
          select: {
            id: true,
            question_id: true,
            answer_value: true,
            justification: true,
          },
        },
        test: {
          select: {
            id: true,
            title: true,
            pdf_url: true,
            status: true,
            duration_minutes: true,
            activated_at: true,
            ends_at: true,
            require_false_justification: true,
            questions: {
              orderBy: { question_number: 'asc' },
              select: {
                id: true,
                question_number: true,
                question_label: true,
                type: true,
                question_text: true,
                points: true,
                options: true,
              },
            },
          },
        },
      },
    });

    if (!attempt) {
      throw new Error('Intento no encontrado');
    }

    if (attempt.device_token !== deviceToken) {
      throw new Error('Token de dispositivo inválido');
    }

    // Actualizar última actividad
    await prisma.studentAttempt.update({
      where: { id: attemptId },
      data: { last_activity_at: new Date() },
    });

    // Calcular tiempo restante
    let timeRemainingSeconds: number | null = null;
    if (attempt.test.status === 'ACTIVE' && attempt.test.ends_at) {
      const now = new Date();
      const endsAt = new Date(attempt.test.ends_at);
      timeRemainingSeconds = Math.max(0, Math.floor((endsAt.getTime() - now.getTime()) / 1000));
    }

    return {
      id: attempt.id,
      studentName: attempt.student_name,
      studentEmail: attempt.student_email,
      status: attempt.status,
      submittedAt: attempt.submitted_at,
      answers: attempt.answers.map(a => ({
        questionId: a.question_id,
        answerValue: a.answer_value,
        justification: a.justification,
      })),
      test: {
        id: attempt.test.id,
        title: attempt.test.title,
        pdfUrl: attempt.test.pdf_url,
        status: attempt.test.status,
        durationMinutes: attempt.test.duration_minutes,
        endsAt: attempt.test.ends_at,
        timeRemainingSeconds,
        requireFalseJustification: attempt.test.require_false_justification,
        questions: attempt.test.questions.map(q => ({
          id: q.id,
          questionNumber: q.question_number,
          questionLabel: q.question_label || String(q.question_number),
          type: q.type,
          questionText: q.question_text,
          points: Number(q.points),
          options: q.options,
        })),
      },
    };
  }

  /**
   * Guardar respuestas (autosave)
   */
  async saveAnswers(attemptId: string, deviceToken: string, answers: SaveAnswersData[]) {
    // Validar deviceToken
    const attempt = await prisma.studentAttempt.findUnique({
      where: { id: attemptId },
    });

    if (!attempt) {
      throw new Error('Intento no encontrado');
    }

    if (attempt.device_token !== deviceToken) {
      throw new Error('Token de dispositivo inválido');
    }

    if (attempt.status === 'SUBMITTED') {
      throw new Error('La prueba ya fue entregada');
    }

    // Upsert cada respuesta
    for (const answer of answers) {
      await prisma.answer.upsert({
        where: {
          student_attempt_id_question_id: {
            student_attempt_id: attemptId,
            question_id: answer.questionId,
          },
        },
        update: {
          answer_value: answer.answerValue,
          justification: answer.justification || null,
        },
        create: {
          student_attempt_id: attemptId,
          question_id: answer.questionId,
          answer_value: answer.answerValue,
          justification: answer.justification || null,
        },
      });
    }

    // Actualizar última actividad
    await prisma.studentAttempt.update({
      where: { id: attemptId },
      data: { last_activity_at: new Date() },
    });

    return { success: true, savedCount: answers.length };
  }

  /**
   * Entregar prueba
   */
  async submitAttempt(attemptId: string, deviceToken: string) {
    const attempt = await prisma.studentAttempt.findUnique({
      where: { id: attemptId },
    });

    if (!attempt) {
      throw new Error('Intento no encontrado');
    }

    if (attempt.device_token !== deviceToken) {
      throw new Error('Token de dispositivo inválido');
    }

    if (attempt.status === 'SUBMITTED') {
      throw new Error('La prueba ya fue entregada');
    }

    // Cambiar status a SUBMITTED
    const updatedAttempt = await prisma.studentAttempt.update({
      where: { id: attemptId },
      data: {
        status: 'SUBMITTED',
        submitted_at: new Date(),
      },
    });

    return {
      success: true,
      resultsToken: updatedAttempt.results_token,
      submittedAt: updatedAttempt.submitted_at,
    };
  }

  /**
   * Obtener intentos de una prueba (para monitoreo del profesor)
   */
  async getTestAttempts(testId: string, teacherId: string) {
    // Verificar que el profesor sea dueño de la prueba
    let test = await prisma.test.findUnique({
      where: { id: testId },
      include: {
        course: {
          include: {
            students: {
              orderBy: { student_name: 'asc' },
            },
          },
        },
      },
    });

    if (!test) {
      throw new Error('Prueba no encontrada');
    }

    if (test.teacher_id !== teacherId) {
      throw new Error('No tienes permiso para ver esta prueba');
    }

    // Verificar si la prueba ha expirado y cerrarla automáticamente
    const wasClosed = await this.checkAndCloseExpiredTest(test);
    if (wasClosed) {
      // Recargar el test para obtener el estado actualizado
      test = await prisma.test.findUnique({
        where: { id: testId },
        include: {
          course: {
            include: {
              students: {
                orderBy: { student_name: 'asc' },
              },
            },
          },
        },
      }) as typeof test;
    }

    // Obtener todos los intentos
    const attempts = await prisma.studentAttempt.findMany({
      where: { test_id: testId },
      include: {
        course_student: true,
        _count: {
          select: { answers: true },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    // Mapear estudiantes del curso con su estado
    const courseStudents = test.course?.students || [];
    const attemptMap = new Map(
      attempts.map(a => [a.course_student_id, a])
    );

    const studentsWithStatus = courseStudents.map(student => {
      const attempt = attemptMap.get(student.id);
      return {
        courseStudentId: student.id,
        studentName: student.student_name,
        studentEmail: student.student_email,
        status: attempt
          ? (attempt.status === 'SUBMITTED' ? 'SUBMITTED' : 'IN_PROGRESS')
          : 'NOT_STARTED',
        attemptId: attempt?.id || null,
        answersCount: attempt?._count.answers || 0,
        lastActivity: attempt?.last_activity_at || null,
        submittedAt: attempt?.submitted_at || null,
        isUnlocked: attempt?.is_unlocked || false,
      };
    });

    // Calcular tiempo restante si la prueba está activa
    let timeRemainingSeconds: number | null = null;
    if (test.status === 'ACTIVE' && test.ends_at) {
      const now = new Date();
      const endsAt = new Date(test.ends_at);
      timeRemainingSeconds = Math.max(0, Math.floor((endsAt.getTime() - now.getTime()) / 1000));
    }

    return {
      test: {
        id: test.id,
        title: test.title,
        status: test.status,
        courseName: test.course?.name || null,
        totalStudents: courseStudents.length,
        durationMinutes: test.duration_minutes,
        activatedAt: test.activated_at,
        endsAt: test.ends_at,
        timeRemainingSeconds,
        correctionCompletedAt: test.correction_completed_at,
      },
      students: studentsWithStatus,
      summary: {
        notStarted: studentsWithStatus.filter(s => s.status === 'NOT_STARTED').length,
        inProgress: studentsWithStatus.filter(s => s.status === 'IN_PROGRESS').length,
        submitted: studentsWithStatus.filter(s => s.status === 'SUBMITTED').length,
      },
    };
  }

  /**
   * Desbloquear estudiante (elimina el intento para liberar el nombre)
   */
  async unlockStudent(attemptId: string, teacherId: string) {
    // Buscar el intento con su prueba
    const attempt = await prisma.studentAttempt.findUnique({
      where: { id: attemptId },
      include: {
        test: true,
      },
    });

    if (!attempt) {
      throw new Error('Intento no encontrado');
    }

    if (attempt.test.teacher_id !== teacherId) {
      throw new Error('No tienes permiso para desbloquear este estudiante');
    }

    // Eliminar el intento para liberar completamente el nombre
    await prisma.studentAttempt.delete({
      where: { id: attemptId },
    });

    return {
      success: true,
      message: 'Estudiante desbloqueado correctamente',
    };
  }

  /**
   * Registrar intento de paste externo (silencioso)
   */
  async recordPasteAttempt(attemptId: string, deviceToken: string): Promise<void> {
    const attempt = await prisma.studentAttempt.findUnique({
      where: { id: attemptId },
    });

    if (!attempt || attempt.device_token !== deviceToken) {
      return; // Silencioso - no revelar errores
    }

    if (attempt.status === 'SUBMITTED') {
      return; // No registrar si ya entregó
    }

    // Incrementar contador de paste
    await prisma.studentAttempt.update({
      where: { id: attemptId },
      data: {
        paste_attempts: { increment: 1 },
      },
    });
  }

  /**
   * Helper para formatear respuesta de join
   */
  private formatJoinResponse(attemptId: string, deviceToken: string, test: any): JoinTestResponse {
    return {
      attemptId,
      deviceToken,
      test: {
        id: test.id,
        title: test.title,
        pdfUrl: test.pdf_url,
        questions: test.questions.map((q: any) => ({
          id: q.id,
          questionNumber: q.question_number,
          questionLabel: q.question_label || String(q.question_number),
          type: q.type,
          questionText: q.question_text,
          points: Number(q.points),
          options: q.options,
        })),
      },
    };
  }
}

// Exportar instancia única del servicio
export const studentService = new StudentService();
