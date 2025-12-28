// Controlador de Tests - Maneja peticiones HTTP
import { Request, Response } from 'express';
import { testsService } from './tests.service';

export class TestsController {
  
  /**
   * POST /api/tests
   * Crear una nueva prueba
   */
  async createTest(req: Request, res: Response): Promise<void> {
    try {
      const { title } = req.body;
      const teacherId = req.teacherId!; // Viene del middleware de auth
      
      // Validaciones
      if (!title || title.trim().length === 0) {
        res.status(400).json({ error: 'El título es requerido' });
        return;
      }
      
      const test = await testsService.createTest({ title, teacherId });
      
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
      const { title } = req.body;
      const teacherId = req.teacherId!;
      
      // Validaciones
      if (!title || title.trim().length === 0) {
        res.status(400).json({ error: 'El título es requerido' });
        return;
      }
      
      const updatedTest = await testsService.updateTest(id, teacherId, { title });
      
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
      const teacherId = req.teacherId!;
      
      const activatedTest = await testsService.activateTest(id, teacherId);
      
      res.status(200).json(activatedTest);
      
    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Error al activar la prueba' });
      }
    }
  }
}

// Exportar instancia única del controlador
export const testsController = new TestsController();
