// Controlador de Estudiantes - Maneja peticiones HTTP
import { Request, Response } from 'express';
import { studentService } from './student.service';

export class StudentController {

  /**
   * GET /api/student/test/:accessCode/students
   * Obtener estudiantes disponibles para una prueba
   */
  async getAvailableStudents(req: Request, res: Response): Promise<void> {
    try {
      const { accessCode } = req.params;

      if (!accessCode) {
        res.status(400).json({ error: 'El código de acceso es requerido' });
        return;
      }

      const result = await studentService.getAvailableStudents(accessCode.toUpperCase().trim());

      res.status(200).json(result);

    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Error al obtener estudiantes' });
      }
    }
  }

  /**
   * POST /api/student/join
   * Unirse a una prueba con código de acceso (lista cerrada)
   */
  async join(req: Request, res: Response): Promise<void> {
    try {
      const { accessCode, courseStudentId, deviceToken, studentEmail } = req.body;

      // Validaciones básicas
      if (!accessCode) {
        res.status(400).json({ error: 'El código de acceso es requerido' });
        return;
      }

      if (!courseStudentId) {
        res.status(400).json({ error: 'Debes seleccionar tu nombre de la lista' });
        return;
      }

      const result = await studentService.joinTest({
        accessCode: accessCode.toUpperCase().trim(),
        courseStudentId,
        deviceToken,
        studentEmail: studentEmail?.trim() || undefined,
      });

      res.status(200).json(result);

    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Error al unirse a la prueba' });
      }
    }
  }

  /**
   * GET /api/student/attempt/:attemptId
   * Obtener intento con sus respuestas actuales
   */
  async getAttempt(req: Request, res: Response): Promise<void> {
    try {
      const { attemptId } = req.params;
      const deviceToken = req.headers['x-device-token'] as string;

      if (!deviceToken) {
        res.status(401).json({ error: 'Token de dispositivo requerido' });
        return;
      }

      const result = await studentService.getAttempt(attemptId, deviceToken);

      res.status(200).json(result);

    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('inválido')) {
          res.status(401).json({ error: error.message });
        } else {
          res.status(404).json({ error: error.message });
        }
      } else {
        res.status(500).json({ error: 'Error al obtener el intento' });
      }
    }
  }

  /**
   * POST /api/student/attempt/:attemptId/save
   * Guardar respuestas (autosave)
   */
  async saveAnswers(req: Request, res: Response): Promise<void> {
    try {
      const { attemptId } = req.params;
      const deviceToken = req.headers['x-device-token'] as string;
      const { answers } = req.body;

      if (!deviceToken) {
        res.status(401).json({ error: 'Token de dispositivo requerido' });
        return;
      }

      if (!answers || !Array.isArray(answers)) {
        res.status(400).json({ error: 'Se requiere un array de respuestas' });
        return;
      }

      const result = await studentService.saveAnswers(attemptId, deviceToken, answers);

      res.status(200).json(result);

    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('inválido')) {
          res.status(401).json({ error: error.message });
        } else if (error.message.includes('entregada')) {
          res.status(409).json({ error: error.message });
        } else {
          res.status(400).json({ error: error.message });
        }
      } else {
        res.status(500).json({ error: 'Error al guardar respuestas' });
      }
    }
  }

  /**
   * POST /api/student/attempt/:attemptId/submit
   * Entregar prueba
   */
  async submitAttempt(req: Request, res: Response): Promise<void> {
    try {
      const { attemptId } = req.params;
      const deviceToken = req.headers['x-device-token'] as string;

      if (!deviceToken) {
        res.status(401).json({ error: 'Token de dispositivo requerido' });
        return;
      }

      const result = await studentService.submitAttempt(attemptId, deviceToken);

      res.status(200).json(result);

    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('inválido')) {
          res.status(401).json({ error: error.message });
        } else if (error.message.includes('entregada')) {
          res.status(409).json({ error: error.message });
        } else {
          res.status(400).json({ error: error.message });
        }
      } else {
        res.status(500).json({ error: 'Error al entregar la prueba' });
      }
    }
  }

  /**
   * POST /api/student/attempt/:attemptId/paste-attempt
   * Registrar intento de paste externo (silencioso)
   */
  async recordPasteAttempt(req: Request, res: Response): Promise<void> {
    try {
      const { attemptId } = req.params;
      const deviceToken = req.headers['x-device-token'] as string;

      if (!deviceToken) {
        res.status(401).json({ error: 'Token de dispositivo requerido' });
        return;
      }

      await studentService.recordPasteAttempt(attemptId, deviceToken);

      // Respuesta silenciosa - no revelar al estudiante que se registró
      res.status(200).json({ success: true });

    } catch (error) {
      // Silencioso - no revelar errores al estudiante
      res.status(200).json({ success: true });
    }
  }
}

// Exportar instancia única del controlador
export const studentController = new StudentController();
