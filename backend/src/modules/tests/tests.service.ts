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
    const tests = await prisma.test.findMany({
      where: {
        teacher_id: teacherId,
      },
      include: {
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
  async activateTest(testId: string, teacherId: string) {
    // Importar la función de generación de código
    const { generateUniqueAccessCode } = require('../../utils/generateCode');

    // Verificar que la prueba pertenece al profesor
    const test = await this.getTestById(testId, teacherId);

    // Verificar que esté en estado DRAFT
    if (test.status !== TestStatus.DRAFT) {
      throw new Error('Solo se pueden activar pruebas en borrador');
    }

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

    // Activar la prueba
    const activatedTest = await prisma.test.update({
      where: { id: testId },
      data: {
        status: TestStatus.ACTIVE,
        access_code: accessCode,
        activated_at: new Date(),
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
