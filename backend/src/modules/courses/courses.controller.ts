// Controlador de Courses - Maneja peticiones HTTP
import { Request, Response } from 'express';
import { coursesService } from './courses.service';

export class CoursesController {

  /**
   * POST /api/courses
   * Crear un nuevo curso
   */
  async createCourse(req: Request, res: Response): Promise<void> {
    try {
      const { name, year, institutional } = req.body;
      const teacherId = req.teacherId!;

      // Validaciones
      if (!name || name.trim().length === 0) {
        res.status(400).json({ error: 'El nombre del curso es requerido' });
        return;
      }

      if (!year || isNaN(Number(year))) {
        res.status(400).json({ error: 'El año es requerido y debe ser un número' });
        return;
      }

      let institutionId: string | undefined;
      if (institutional) {
        const adminInfo = await coursesService.isInstitutionAdmin(teacherId);
        if (!adminInfo.isAdmin || !adminInfo.institutionId) {
          res.status(403).json({ error: 'No tienes permisos para crear cursos institucionales' });
          return;
        }
        institutionId = adminInfo.institutionId;
      }

      const course = await coursesService.createCourse({
        name: name.trim(),
        year: Number(year),
        teacherId,
        institutionId,
      });

      res.status(201).json(course);

    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Error al crear el curso' });
      }
    }
  }

  /**
   * GET /api/courses
   * Listar todos los cursos del profesor
   */
  async getCourses(req: Request, res: Response): Promise<void> {
    try {
      const teacherId = req.teacherId!;

      const courses = await coursesService.getCoursesByTeacher(teacherId);

      res.status(200).json(courses);

    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Error al obtener los cursos' });
      }
    }
  }

  /**
   * GET /api/courses/:id
   * Obtener un curso específico con sus estudiantes
   */
  async getCourseById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const teacherId = req.teacherId!;

      const course = await coursesService.getCourseById(id, teacherId);

      res.status(200).json(course);

    } catch (error) {
      if (error instanceof Error) {
        res.status(404).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Error al obtener el curso' });
      }
    }
  }

  /**
   * PUT /api/courses/:id
   * Actualizar un curso
   */
  async updateCourse(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { name, year } = req.body;
      const teacherId = req.teacherId!;

      // Validaciones
      if (name !== undefined && name.trim().length === 0) {
        res.status(400).json({ error: 'El nombre del curso no puede estar vacío' });
        return;
      }

      if (year !== undefined && isNaN(Number(year))) {
        res.status(400).json({ error: 'El año debe ser un número' });
        return;
      }

      const updatedCourse = await coursesService.updateCourse(id, teacherId, {
        name: name?.trim(),
        year: year ? Number(year) : undefined,
      });

      res.status(200).json(updatedCourse);

    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Error al actualizar el curso' });
      }
    }
  }

  /**
   * DELETE /api/courses/:id
   * Eliminar un curso
   */
  async deleteCourse(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const teacherId = req.teacherId!;

      const result = await coursesService.deleteCourse(id, teacherId);

      res.status(200).json(result);

    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Error al eliminar el curso' });
      }
    }
  }

  /**
   * POST /api/courses/:id/students
   * Agregar estudiantes desde JSON array
   */
  async addStudents(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { students } = req.body;
      const teacherId = req.teacherId!;

      if (!students || !Array.isArray(students)) {
        res.status(400).json({ error: 'Debe proporcionar un array de estudiantes' });
        return;
      }

      const result = await coursesService.addStudents(id, teacherId, students);

      res.status(201).json(result);

    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Error al agregar estudiantes' });
      }
    }
  }

  /**
   * POST /api/courses/:id/upload
   * Subir archivo Excel/CSV con lista de estudiantes
   */
  async uploadStudents(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const teacherId = req.teacherId!;

      if (!req.file) {
        res.status(400).json({ error: 'No se proporcionó ningún archivo' });
        return;
      }

      const result = await coursesService.uploadStudents(
        id,
        teacherId,
        req.file.buffer,
        req.file.originalname
      );

      res.status(201).json(result);

    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Error al procesar el archivo' });
      }
    }
  }

  /**
   * DELETE /api/courses/:id/students/:studentId
   * Eliminar un estudiante del curso
   */
  async deleteStudent(req: Request, res: Response): Promise<void> {
    try {
      const { id, studentId } = req.params;
      const teacherId = req.teacherId!;

      const result = await coursesService.deleteStudent(id, studentId, teacherId);

      res.status(200).json(result);

    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Error al eliminar el estudiante' });
      }
    }
  }
}

// Exportar instancia única del controlador
export const coursesController = new CoursesController();
