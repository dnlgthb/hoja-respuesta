// Validación de variables de entorno
import dotenv from 'dotenv';

dotenv.config();

// Verificar que todas las variables necesarias estén presentes
const requiredEnvVars = [
  'DATABASE_URL',
  'JWT_SECRET',
  'OPENAI_API_KEY',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'RESEND_API_KEY',
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`❌ Falta la variable de entorno: ${envVar}`);
  }
}

// Exportar variables tipadas
export const env = {
  DATABASE_URL: process.env.DATABASE_URL!,
  JWT_SECRET: process.env.JWT_SECRET!,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY!,
  OPENAI_MODEL: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  OPENAI_VISION_MODEL: process.env.OPENAI_VISION_MODEL || process.env.OPENAI_MODEL || 'gpt-4o',
  MATHPIX_APP_ID: process.env.MATHPIX_APP_ID || '',
  MATHPIX_APP_KEY: process.env.MATHPIX_APP_KEY || '',
  SUPABASE_URL: process.env.SUPABASE_URL!,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY!,
  RESEND_API_KEY: process.env.RESEND_API_KEY!,
  PORT: parseInt(process.env.PORT || '3001'),
  NODE_ENV: process.env.NODE_ENV || 'development',
};

console.log('✅ Variables de entorno cargadas correctamente');
