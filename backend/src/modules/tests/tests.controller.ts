// Controlador de Tests - Maneja peticiones HTTP
import { Request, Response } from 'express';
import { testsService } from './tests.service';
import { studentService } from '../student/student.service';

export class TestsController {
  
  /**
   * POST /api/tests
   * Crear una nueva prueba
   */
  async createTest(req: Request, res: Response): Promise<void> {
    try {
      const { title, courseId } = req.body;
      const teacherId = req.teacherId!; // Viene del middleware de auth

      // Validaciones
      if (!title || title.trim().length === 0) {
        res.status(400).json({ error: 'El título es requerido' });
        return;
      }

      const test = await testsService.createTest({ title, teacherId, courseId });

      res.status(201).json(test);

    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Error al crear la prueba' });
      }
    }
  }
  
  /**
   * GET /api/tests
   * Listar todas las pruebas del profesor
   */
  async getTests(req: Request, res: Response): Promise<void> {
    try {
      const teacherId = req.teacherId!;
      
      const tests = await testsService.getTestsByTeacher(teacherId);
      
      res.status(200).json(tests);
      
    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Error al obtener las pruebas' });
      }
    }
  }
  
  /**
   * GET /api/tests/:id
   * Obtener una prueba específica
   */
  async getTestById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const teacherId = req.teacherId!;
      
      const test = await testsService.getTestById(id, teacherId);
      
      res.status(200).json(test);
      
    } catch (error) {
      if (error instanceof Error) {
        res.status(404).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Error al obtener la prueba' });
      }
    }
  }
  
  /**
   * PUT /api/tests/:id
   * Actualizar una prueba
   */
  async updateTest(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const {
        title,
        courseId,
        // Opciones de corrección
        requireFalseJustification,
        falseJustificationPenalty,
        evaluateSpelling,
        evaluateWriting,
        spellingPoints,
        writingPoints,
      } = req.body;
      const teacherId = req.teacherId!;

      // Al menos un campo debe estar presente
      const hasCorrectionOptions =
        requireFalseJustification !== undefined ||
        falseJustificationPenalty !== undefined ||
        evaluateSpelling !== undefined ||
        evaluateWriting !== undefined ||
        spellingPoints !== undefined ||
        writingPoints !== undefined;

      if (!title && courseId === undefined && !hasCorrectionOptions) {
        res.status(400).json({ error: 'Debe proporcionar al menos un campo para actualizar' });
        return;
      }

      const updatedTest = await testsService.updateTest(id, teacherId, {
        title,
        courseId,
        requireFalseJustification,
        falseJustificationPenalty,
        evaluateSpelling,
        evaluateWriting,
        spellingPoints,
        writingPoints,
      });

      res.status(200).json(updatedTest);

    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Error al actualizar la prueba' });
      }
    }
  }
  
  /**
   * DELETE /api/tests/:id
   * Eliminar una prueba
   */
  async deleteTest(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const teacherId = req.teacherId!;
      
      const result = await testsService.deleteTest(id, teacherId);
      
      res.status(200).json(result);
      
    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Error al eliminar la prueba' });
      }
    }
  }
  
  /**
   * POST /api/tests/:id/upload-pdf
   * Subir PDF de la prueba
   */
  async uploadPDF(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const teacherId = req.teacherId!;
      
      // Validar que se subió un archivo
      if (!req.file) {
        res.status(400).json({ error: 'No se proporcionó ningún archivo' });
        return;
      }
      
      const fileBuffer = req.file.buffer;
      const originalName = req.file.originalname;
      
      const updatedTest = await testsService.uploadTestPDF(id, teacherId, fileBuffer, originalName);
      
      res.status(200).json(updatedTest);
      
    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Error al subir el PDF' });
      }
    }
  }
  
  /**
   * POST /api/tests/:id/analyze-pdf
   * Analizar PDF con IA y crear preguntas
   */
  async analyzePDF(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const teacherId = req.teacherId!;

      // Timeout extendido para PDFs grandes (10 minutos)
      req.setTimeout(600_000);
      res.setTimeout(600_000);

      // Validar que se subió un archivo
      if (!req.file) {
        res.status(400).json({ error: 'No se proporcionó ningún archivo' });
        return;
      }

      const fileBuffer = req.file.buffer;

      const result = await testsService.analyzePDF(id, teacherId, fileBuffer);
      
      res.status(200).json(result);
      
    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Error al analizar el PDF' });
      }
    }
  }
  
  /**
   * POST /api/tests/:id/activate
   * Activar una prueba (generar código de acceso)
   */
  async activateTest(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { durationMinutes } = req.body;
      const teacherId = req.teacherId!;

      // Validar que se proporcionó duración
      if (!durationMinutes) {
        res.status(400).json({ error: 'La duración en minutos es requerida' });
        return;
      }

      const activatedTest = await testsService.activateTest(id, teacherId, durationMinutes);

      res.status(200).json(activatedTest);

    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Error al activar la prueba' });
      }
    }
  }

  /**
   * POST /api/tests/:id/close
   * Cerrar una prueba activa
   */
  async closeTest(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const teacherId = req.teacherId!;

      const closedTest = await testsService.closeTest(id, teacherId);

      res.status(200).json(closedTest);

    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Error al cerrar la prueba' });
      }
    }
  }

  /**
   * POST /api/tests/:id/duplicate
   * Duplicar una prueba existente
   */
  async duplicateTest(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { title, courseId } = req.body;
      const teacherId = req.teacherId!;

      const duplicatedTest = await testsService.duplicateTest(id, teacherId, title, courseId);

      res.status(201).json(duplicatedTest);

    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Error al duplicar la prueba' });
      }
    }
  }

  /**
   * PUT /api/tests/:id/questions/:questionId
   * Actualizar una pregunta específica
   */
  async updateQuestion(req: Request, res: Response): Promise<void> {
    try {
      const { id: testId, questionId } = req.params;
      const teacherId = req.teacherId!;
      const updates = req.body;

      const updatedQuestion = await testsService.updateQuestion(
        testId,
        questionId,
        teacherId,
        updates
      );
      
      res.status(200).json(updatedQuestion);
      
    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Error al actualizar la pregunta' });
      }
    }
  }

  /**
   * DELETE /api/tests/:id/questions/:questionId
   * Eliminar una pregunta específica
   */
  async deleteQuestion(req: Request, res: Response): Promise<void> {
    try {
      const { id: testId, questionId } = req.params;
      const teacherId = req.teacherId!;

      const result = await testsService.deleteQuestion(testId, questionId, teacherId);

      res.status(200).json(result);

    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Error al eliminar la pregunta' });
      }
    }
  }

  /**
   * POST /api/tests/:id/questions
   * Crear una nueva pregunta manualmente
   */
  async createQuestion(req: Request, res: Response): Promise<void> {
    try {
      const { id: testId } = req.params;
      const teacherId = req.teacherId!;
      const data = req.body;

      const newQuestion = await testsService.createQuestion(testId, teacherId, data);

      res.status(201).json(newQuestion);

    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Error al crear la pregunta' });
      }
    }
  }

  /**
   * PUT /api/tests/:id/questions/reorder
   * Reordenar preguntas
   */
  async reorderQuestions(req: Request, res: Response): Promise<void> {
    try {
      const { id: testId } = req.params;
      const teacherId = req.teacherId!;
      const { questionIds } = req.body;

      if (!Array.isArray(questionIds)) {
        res.status(400).json({ error: 'Se requiere un array de IDs de preguntas' });
        return;
      }

      const questions = await testsService.reorderQuestions(testId, teacherId, questionIds);

      res.status(200).json(questions);

    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Error al reordenar las preguntas' });
      }
    }
  }

  /**
   * GET /api/tests/:id/results
   * Obtener resultados de una prueba (para dashboard de resultados)
   */
  async getTestResults(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const teacherId = req.teacherId!;

      const results = await testsService.getTestResults(id, teacherId);

      res.status(200).json(results);

    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Error al obtener los resultados' });
      }
    }
  }

  /**
   * PUT /api/tests/:id/answers/:answerId
   * Actualizar una respuesta (edición manual de puntaje/feedback)
   */
  async updateAnswer(req: Request, res: Response): Promise<void> {
    try {
      const { id: testId, answerId } = req.params;
      const { pointsEarned, aiFeedback } = req.body;
      const teacherId = req.teacherId!;

      const updatedAnswer = await testsService.updateAnswer(
        testId,
        answerId,
        teacherId,
        { pointsEarned, aiFeedback }
      );

      res.status(200).json(updatedAnswer);

    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Error al actualizar la respuesta' });
      }
    }
  }

  /**
   * POST /api/tests/:id/attempts/:attemptId/mark-reviewed
   * Marcar un intento como revisado
   */
  async markAttemptReviewed(req: Request, res: Response): Promise<void> {
    try {
      const { id: testId, attemptId } = req.params;
      const teacherId = req.teacherId!;

      const result = await testsService.markAttemptReviewed(testId, attemptId, teacherId);

      res.status(200).json(result);

    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Error al marcar como revisado' });
      }
    }
  }

  /**
   * PUT /api/tests/:id/passing-threshold
   * Actualizar la exigencia (porcentaje mínimo para nota 4.0)
   */
  async updatePassingThreshold(req: Request, res: Response): Promise<void> {
    try {
      const { id: testId } = req.params;
      const { passingThreshold } = req.body;
      const teacherId = req.teacherId!;

      if (passingThreshold === undefined) {
        res.status(400).json({ error: 'La exigencia es requerida' });
        return;
      }

      const result = await testsService.updatePassingThreshold(testId, teacherId, passingThreshold);

      res.status(200).json(result);

    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Error al actualizar la exigencia' });
      }
    }
  }

  /**
   * POST /api/tests/:id/send-results
   * Enviar resultados por email a estudiantes
   */
  async sendResults(req: Request, res: Response): Promise<void> {
    try {
      const { id: testId } = req.params;
      const { studentAttemptIds, includeGrade = true } = req.body;
      const teacherId = req.teacherId!;

      const result = await testsService.sendResults(testId, teacherId, studentAttemptIds, includeGrade);

      res.status(200).json(result);

    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Error al enviar los resultados' });
      }
    }
  }

  /**
   * GET /api/tests/:id/export
   * Exportar resultados a Excel
   */
  async exportResults(req: Request, res: Response): Promise<void> {
    try {
      const { id: testId } = req.params;
      const teacherId = req.teacherId!;

      const buffer = await testsService.exportResults(testId, teacherId);

      // Configurar headers para descarga
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="resultados-${testId}.xlsx"`);

      res.send(buffer);

    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Error al exportar los resultados' });
      }
    }
  }

  /**
   * GET /api/tests/:id/attempts
   * Obtener intentos de una prueba (monitoreo)
   */
  async getTestAttempts(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const teacherId = req.teacherId!;

      const result = await studentService.getTestAttempts(id, teacherId);

      res.status(200).json(result);

    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('permiso')) {
          res.status(403).json({ error: error.message });
        } else {
          res.status(404).json({ error: error.message });
        }
      } else {
        res.status(500).json({ error: 'Error al obtener los intentos' });
      }
    }
  }

  /**
   * POST /api/tests/:id/attempts/:attemptId/unlock
   * Desbloquear estudiante (elimina el intento)
   */
  async unlockStudent(req: Request, res: Response): Promise<void> {
    try {
      const { attemptId } = req.params;
      const teacherId = req.teacherId!;

      const result = await studentService.unlockStudent(attemptId, teacherId);

      res.status(200).json(result);

    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('permiso')) {
          res.status(403).json({ error: error.message });
        } else {
          res.status(404).json({ error: error.message });
        }
      } else {
        res.status(500).json({ error: 'Error al desbloquear estudiante' });
      }
    }
  }

  /**
   * POST /api/tests/:id/analyze-rubric
   * Analizar pauta de corrección PDF con IA
   */
  async analyzeRubric(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const teacherId = req.teacherId!;

      if (!req.file) {
        res.status(400).json({ error: 'No se proporcionó ningún archivo' });
        return;
      }

      const fileBuffer = req.file.buffer;

      const result = await testsService.analyzeRubric(id, teacherId, fileBuffer);

      res.status(200).json(result);

    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Error al analizar la pauta de corrección' });
      }
    }
  }

  /**
   * PUT /api/tests/:id/questions/batch
   * Actualizar múltiples preguntas en batch
   */
  async batchUpdateQuestions(req: Request, res: Response): Promise<void> {
    try {
      const { id: testId } = req.params;
      const teacherId = req.teacherId!;
      const { updates } = req.body;

      if (!updates || !Array.isArray(updates) || updates.length === 0) {
        res.status(400).json({ error: 'Se requiere un array de actualizaciones' });
        return;
      }

      const result = await testsService.batchUpdateQuestions(testId, teacherId, updates);

      res.status(200).json(result);

    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Error al actualizar las preguntas' });
      }
    }
  }
}

// Exportar instancia única del controlador
export const testsController = new TestsController();