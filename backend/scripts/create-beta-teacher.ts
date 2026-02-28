/**
 * Crear cuenta beta para un profesor.
 *
 * Uso:
 *   npx tsx scripts/create-beta-teacher.ts --name "María López" --email maria@colegio.cl
 *   npx tsx scripts/create-beta-teacher.ts --name "María López" --email maria@colegio.cl --password miClave123
 *
 * Si no se pasa --password, se genera una temporal de 8 caracteres.
 * La cuenta se crea con is_beta: true, is_verified: true.
 *
 * Debe correrse desde la carpeta /backend.
 */

import dotenv from 'dotenv';
dotenv.config();

import { PrismaClient } from '../generated/prisma';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

function parseArgs(): Record<string, string> {
  const args: Record<string, string> = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--') && i + 1 < argv.length) {
      const key = argv[i].replace('--', '');
      args[key] = argv[i + 1];
      i++;
    }
  }
  return args;
}

function generatePassword(): string {
  return crypto.randomBytes(4).toString('hex'); // 8 chars hex
}

async function main() {
  const args = parseArgs();

  const name = args['name'];
  const email = args['email'];
  const password = args['password'] || generatePassword();

  if (!name || !email) {
    console.error('Uso: npx tsx scripts/create-beta-teacher.ts --name "Nombre" --email correo@ejemplo.com [--password clave]');
    process.exit(1);
  }

  // Check if email already exists
  const existing = await prisma.teacher.findUnique({ where: { email } });
  if (existing) {
    console.error(`\nEl email ${email} ya está registrado.`);
    if (!existing.is_beta) {
      console.log('Marcando como beta...');
      await prisma.teacher.update({
        where: { id: existing.id },
        data: { is_beta: true, is_verified: true },
      });
      console.log('Cuenta actualizada a beta.');
    } else {
      console.log('Ya es cuenta beta.');
    }
    process.exit(0);
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const teacher = await prisma.teacher.create({
    data: {
      email,
      password: hashedPassword,
      name,
      is_beta: true,
      is_verified: true,
    },
  });

  console.log('\n========================================');
  console.log('  Cuenta beta creada exitosamente');
  console.log('========================================');
  console.log(`  Nombre:     ${teacher.name}`);
  console.log(`  Email:      ${teacher.email}`);
  console.log(`  Contraseña: ${password}`);
  console.log(`  ID:         ${teacher.id}`);
  console.log(`  Beta:       ${teacher.is_beta}`);
  console.log(`  Verificado: ${teacher.is_verified}`);
  console.log('========================================');
  console.log('\nComparte estas credenciales con el profesor.');

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('Error:', e);
  prisma.$disconnect();
  process.exit(1);
});
