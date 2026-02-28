// Rutas de Tests - Endpoints del CRUD y Upload
import { Router } from 'express';
import { testsController } from './tests.controller';
import { authMiddleware } from '../auth/auth.middleware';
import { requireActiveSubscription } from '../auth/subscription.middleware';
import { checkPdfAnalysisLimit, checkAttemptsLimit } from '../auth/usage.middleware';
import { upload, uploadImage } from '../../config/multer';

const router = Router();

// Todas las rutas de tests requieren autenticación
router.use(authMiddleware);

// CRUD de pruebas (crear requiere suscripción, leer es libre)
router.post('/', requireActiveSubscription, (req, res) => testsController.createTest(req, res));
router.get('/', (req, res) => testsController.getTests(req, res));
router.get('/:id', (req, res) => testsController.getTestById(req, res));
router.put('/:id', (req, res) => testsController.updateTest(req, res));
router.delete('/:id', (req, res) => testsController.deleteTest(req, res));

// CRUD de preguntas
router.post('/:id/questions', (req, res) => testsController.createQuestion(req, res));
router.put('/:id/questions/batch', (req, res) => testsController.batchUpdateQuestions(req, res));
router.put('/:id/questions/reorder', (req, res) => testsController.reorderQuestions(req, res));
router.put('/:id/questions/:questionId', (req, res) => testsController.updateQuestion(req, res));
router.delete('/:id/questions/:questionId', (req, res) => testsController.deleteQuestion(req, res));

// Upload y análisis de PDF (requiere suscripción + límite de análisis)
router.post('/:id/upload-pdf', upload.single('pdf'), (req, res) => testsController.uploadPDF(req, res));
router.post('/:id/analyze-pdf', requireActiveSubscription, checkPdfAnalysisLimit, upload.single('pdf'), (req, res) => testsController.analyzePDF(req, res));
router.post('/:id/analyze-rubric', requireActiveSubscription, checkPdfAnalysisLimit, upload.single('pdf'), (req, res) => testsController.analyzeRubric(req, res));

// Upload de imagen para pregunta
router.post('/:id/upload-image', uploadImage.single('image'), (req, res) => testsController.uploadQuestionImage(req, res));

// Activar prueba (requiere suscripción + límite de intentos)
router.post('/:id/activate', requireActiveSubscription, checkAttemptsLimit, (req, res) => testsController.activateTest(req, res));

// Cerrar prueba
router.post('/:id/close', (req, res) => testsController.closeTest(req, res));

// Duplicar prueba
router.post('/:id/duplicate', (req, res) => testsController.duplicateTest(req, res));

// Resultados
router.get('/:id/results', (req, res) => testsController.getTestResults(req, res));
router.put('/:id/answers/:answerId', (req, res) => testsController.updateAnswer(req, res));
router.post('/:id/attempts/:attemptId/mark-reviewed', (req, res) => testsController.markAttemptReviewed(req, res));
router.put('/:id/passing-threshold', (req, res) => testsController.updatePassingThreshold(req, res));
router.post('/:id/send-results', (req, res) => testsController.sendResults(req, res));
router.get('/:id/export', (req, res) => testsController.exportResults(req, res));

// Monitoreo de intentos
router.get('/:id/attempts', (req, res) => testsController.getTestAttempts(req, res));
router.post('/:id/attempts/:attemptId/unlock', (req, res) => testsController.unlockStudent(req, res));

export default router;