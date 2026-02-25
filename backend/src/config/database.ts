// Cliente de Prisma - Conexión a la base de datos
import { PrismaClient } from '../../generated/prisma';

// Singleton: una sola instancia de Prisma en toda la app
const prisma = new PrismaClient({
  log: [
    { level: 'error', emit: 'event' },
    { level: 'warn', emit: 'event' },
  ],
});

// Handle Prisma errors gracefully — Neon kills idle connections during long
// extractions (~5 min), producing FATAL errors that must NOT crash the process.
(prisma.$on as any)('error', (e: any) => {
  console.warn('prisma:warn Connection error (non-fatal):', e.message?.substring(0, 100) || 'unknown');
});
(prisma.$on as any)('warn', (e: any) => {
  console.warn('prisma:warn', e.message?.substring(0, 100) || 'unknown');
});

export default prisma;
