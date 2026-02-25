// Servidor - Punto de entrada de la aplicación
import app from './app';
import { env } from './config/env';
import prisma from './config/database';

const PORT = env.PORT;

// Iniciar servidor
app.listen(PORT, () => {
  console.log('');
  console.log('🚀 ==========================================');
  console.log(`📡 Servidor corriendo en puerto ${PORT}`);
  console.log(`🌐 http://localhost:${PORT}`);
  console.log('🔗 Base de datos conectada');
  console.log('==========================================');
  console.log('');
});

// Prevent unhandled rejections from crashing the server
// (Neon/Prisma fires async errors when idle connections are killed)
process.on('unhandledRejection', (reason) => {
  console.warn('⚠️ Unhandled rejection (non-fatal):', reason instanceof Error ? reason.message : reason);
});

// Manejo de cierre graceful
process.on('SIGINT', async () => {
  console.log('\n👋 Cerrando servidor...');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n👋 Cerrando servidor...');
  await prisma.$disconnect();
  process.exit(0);
});
