// Configuración principal de Express
import express, { Application } from 'express';
import cors from 'cors';
import { env } from './config/env';

// Rutas
import authRoutes from './modules/auth/auth.routes';
import testsRoutes from './modules/tests/tests.routes';

const app: Application = express();

// ============================================
// MIDDLEWARES GLOBALES
// ============================================

// CORS - Permitir peticiones desde el frontend
app.use(cors({
  origin: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000',
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

// TODO: Agregar más rutas aquí

// ============================================
// MANEJO DE ERRORES 404
// ============================================

app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

export default app;
