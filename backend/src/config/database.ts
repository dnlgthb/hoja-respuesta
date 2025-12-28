// Cliente de Prisma - Conexión a la base de datos
import { PrismaClient } from '../../generated/prisma';

// Singleton: una sola instancia de Prisma en toda la app
// La configuración de conexión viene de prisma.config.ts
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

export default prisma;
