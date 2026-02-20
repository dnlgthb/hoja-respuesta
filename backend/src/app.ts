// Configuración principal de Express
import express, { Application } from 'express';
import cors from 'cors';
import { env } from './config/env';

// Rutas
import authRoutes from './modules/auth/auth.routes';
import testsRoutes from './modules/tests/tests.routes';
import studentRoutes from './modules/student/student.routes';
import coursesRoutes from './modules/courses/courses.routes';

const app: Application = express();

// ============================================
// MIDDLEWARES GLOBALES
// ============================================

// CORS - Permitir peticiones desde el frontend
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:3002',
    'https://hoja-respuesta.vercel.app',
    ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
  ],
  credentials: true,
}));

// Parser de JSON
app.use(express.json());

// Parser de URL-encoded
app.use(express.urlencoded({ extended: true }));

// ============================================
// RUTAS
// ============================================

// Ruta de prueba
app.get('/', (req, res) => {
  res.json({ 
    message: '🚀 API de Evaluaciones Digitales',
    version: '1.0.0',
    status: 'running' 
  });
});

// Rutas de autenticación
app.use('/api/auth', authRoutes);

// Rutas de tests
app.use('/api/tests', testsRoutes);

// Rutas de cursos
app.use('/api/courses', coursesRoutes);

// Rutas de estudiantes (públicas)
app.use('/api/student', studentRoutes);

// ============================================
// MANEJO DE ERRORES 404
// ============================================

app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

export default app;
