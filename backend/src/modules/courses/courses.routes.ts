// Rutas de Courses - Endpoints del CRUD y gestión de estudiantes
import { Router } from 'express';
import { coursesController } from './courses.controller';
import { authMiddleware } from '../auth/auth.middleware';
import { uploadSpreadsheet } from '../../config/multer';

const router = Router();

// Todas las rutas de courses requieren autenticación
router.use(authMiddleware);

// CRUD de cursos
router.post('/', (req, res) => coursesController.createCourse(req, res));
router.get('/', (req, res) => coursesController.getCourses(req, res));
router.get('/:id', (req, res) => coursesController.getCourseById(req, res));
router.put('/:id', (req, res) => coursesController.updateCourse(req, res));
router.delete('/:id', (req, res) => coursesController.deleteCourse(req, res));

// Gestión de estudiantes
router.post('/:id/students', (req, res) => coursesController.addStudents(req, res));
router.post('/:id/upload', uploadSpreadsheet.single('file'), (req, res) => coursesController.uploadStudents(req, res));
router.delete('/:id/students/:studentId', (req, res) => coursesController.deleteStudent(req, res));

export default router;
