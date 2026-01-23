// Rutas de Estudiantes - Endpoints públicos (sin JWT)
import { Router } from 'express';
import { studentController } from './student.controller';

const router = Router();

// Todas las rutas son públicas (estudiantes no tienen cuenta)

// Obtener estudiantes disponibles para una prueba
router.get('/test/:accessCode/students', (req, res) => studentController.getAvailableStudents(req, res));

// Unirse a prueba con código (ahora recibe courseStudentId)
router.post('/join', (req, res) => studentController.join(req, res));

// Obtener intento actual (requiere x-device-token header)
router.get('/attempt/:attemptId', (req, res) => studentController.getAttempt(req, res));

// Guardar respuestas - autosave (requiere x-device-token header)
router.post('/attempt/:attemptId/save', (req, res) => studentController.saveAnswers(req, res));

// Entregar prueba (requiere x-device-token header)
router.post('/attempt/:attemptId/submit', (req, res) => studentController.submitAttempt(req, res));

export default router;
