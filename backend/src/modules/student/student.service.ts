// Servicio de Estudiantes - Lógica de negocio
import prisma from '../../config/database';

// Tipos
export interface JoinTestData {
  accessCode: string;
  courseStudentId: string;
  deviceToken?: string;
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
}

export class StudentService {

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
    const { accessCode, courseStudentId, deviceToken } = data;

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
          },
        });
        return this.formatJoinResponse(updatedAttempt.id, newDeviceToken, test);
      }
      throw new Error('Este estudiante ya tiene un intento activo. Contacta al profesor para desbloquear.');
    }

    // 5. Crear nuevo StudentAttempt
    const newDeviceToken = crypto.randomUUID();
    const resultsToken = crypto.randomUUID();

    const newAttempt = await prisma.studentAttempt.create({
      data: {
        test_id: test.id,
        course_student_id: courseStudentId,
        student_name: courseStudent.student_name,
        student_email: courseStudent.student_email || null,
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
          },
        },
        test: {
          select: {
            id: true,
            title: true,
            pdf_url: true,
            status: true,
            questions: {
              orderBy: { question_number: 'asc' },
              select: {
                id: true,
                question_number: true,
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

    return {
      id: attempt.id,
      studentName: attempt.student_name,
      status: attempt.status,
      submittedAt: attempt.submitted_at,
      answers: attempt.answers.map(a => ({
        questionId: a.question_id,
        answerValue: a.answer_value,
      })),
      test: {
        id: attempt.test.id,
        title: attempt.test.title,
        pdfUrl: attempt.test.pdf_url,
        status: attempt.test.status,
        questions: attempt.test.questions.map(q => ({
          id: q.id,
          questionNumber: q.question_number,
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
        },
        create: {
          student_attempt_id: attemptId,
          question_id: answer.questionId,
          answer_value: answer.answerValue,
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
    const test = await prisma.test.findUnique({
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

    return {
      test: {
        id: test.id,
        title: test.title,
        status: test.status,
        courseName: test.course?.name || null,
        totalStudents: courseStudents.length,
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
