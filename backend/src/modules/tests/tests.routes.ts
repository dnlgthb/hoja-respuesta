// Rutas de Tests - Endpoints del CRUD y Upload
import { Router } from 'express';
import { testsController } from './tests.controller';
import { authMiddleware } from '../auth/auth.middleware';
import { upload } from '../../config/multer';

const router = Router();

// Todas las rutas de tests requieren autenticación
router.use(authMiddleware);

// CRUD de pruebas
router.post('/', (req, res) => testsController.createTest(req, res));
router.get('/', (req, res) => testsController.getTests(req, res));
router.get('/:id', (req, res) => testsController.getTestById(req, res));
router.put('/:id', (req, res) => testsController.updateTest(req, res));
router.delete('/:id', (req, res) => testsController.deleteTest(req, res));

// CRUD de preguntas
router.put('/:id/questions/:questionId', (req, res) => testsController.updateQuestion(req, res));
router.delete('/:id/questions/:questionId', (req, res) => testsController.deleteQuestion(req, res));

// Upload y análisis de PDF
router.post('/:id/upload-pdf', upload.single('pdf'), (req, res) => testsController.uploadPDF(req, res));
router.post('/:id/analyze-pdf', upload.single('pdf'), (req, res) => testsController.analyzePDF(req, res));

// Activar prueba (generar código)
router.post('/:id/activate', (req, res) => testsController.activateTest(req, res));

// Monitoreo de intentos
router.get('/:id/attempts', (req, res) => testsController.getTestAttempts(req, res));
router.post('/:id/attempts/:attemptId/unlock', (req, res) => testsController.unlockStudent(req, res));

export default router;