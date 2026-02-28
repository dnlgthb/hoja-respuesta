/**
 * Script para administrar instituciones y cuentas institucionales.
 *
 * Uso:
 *   npx tsx scripts/manage-institution.ts create --name "Colegio X" --contact-email admin@colegio.cl --contact-name "Juan" --price 6990 --months 12
 *   npx tsx scripts/manage-institution.ts add-teachers --institution-id <id> --teachers "María López,maria@colegio.cl;Pedro Soto,pedro@colegio.cl"
 *   npx tsx scripts/manage-institution.ts list
 *   npx tsx scripts/manage-institution.ts status --institution-id <id>
 *
 * Debe correrse desde la carpeta /backend.
 */

import dotenv from 'dotenv';
dotenv.config();

import { PrismaClient } from '../generated/prisma';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://hoja-respuesta.vercel.app';

// ============================================
// HELPERS
// ============================================

function parseArgs(): Record<string, string> {
  const args: Record<string, string> = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].replace(/^--/, '');
      args[key] = argv[i + 1] || '';
      i++;
    } else if (!args._command) {
      args._command = argv[i];
    }
  }
  return args;
}

// ============================================
// CREATE INSTITUTION
// ============================================

async function createInstitution(args: Record<string, string>) {
  const name = args['name'];
  const contactEmail = args['contact-email'];
  const contactName = args['contact-name'];
  const planPrice = parseInt(args['price'] || '6990');
  const maxTeachers = parseInt(args['max-teachers'] || '50');
  const months = parseInt(args['months'] || '12');

  if (!name || !contactEmail || !contactName) {
    console.error('Uso: create --name "Nombre" --contact-email email@x.cl --contact-name "Nombre Contacto" [--price 6990] [--max-teachers 10] [--months 12]');
    process.exit(1);
  }

  // Create institution
  const institution = await prisma.institution.create({
    data: {
      name,
      contact_email: contactEmail,
      contact_name: contactName,
      plan_price: planPrice,
      max_teachers: maxTeachers,
    },
  });

  console.log(`\nInstitución creada: ${institution.id}`);
  console.log(`  Nombre: ${name}`);
  console.log(`  Contacto: ${contactName} (${contactEmail})`);
  console.log(`  Precio/profesor: $${planPrice}`);

  // Create subscription
  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + months);

  const sub = await prisma.institutionSubscription.create({
    data: {
      institution_id: institution.id,
      status: 'ACTIVE',
      period_start: now,
      period_end: periodEnd,
    },
  });

  console.log(`  Suscripción: ACTIVE hasta ${periodEnd.toLocaleDateString('es-CL')}`);
  console.log(`\nID para agregar profesores: ${institution.id}`);
}

// ============================================
// ADD TEACHERS TO INSTITUTION
// ============================================

async function addTeachers(args: Record<string, string>) {
  const institutionId = args['institution-id'];
  const teachersStr = args['teachers'];

  if (!institutionId || !teachersStr) {
    console.error('Uso: add-teachers --institution-id <id> --teachers "Nombre,email;Nombre2,email2"');
    process.exit(1);
  }

  // Verify institution exists
  const institution = await prisma.institution.findUnique({
    where: { id: institutionId },
    include: { subscription: true },
  });

  if (!institution) {
    console.error(`Institución no encontrada: ${institutionId}`);
    process.exit(1);
  }

  console.log(`\nAgregando profesores a: ${institution.name}`);

  // Parse teachers: "Name,email;Name2,email2"
  const teacherPairs = teachersStr.split(';').map(t => {
    const [name, email] = t.trim().split(',').map(s => s.trim());
    return { name, email };
  }).filter(t => t.name && t.email);

  if (teacherPairs.length === 0) {
    console.error('No se pudieron parsear profesores. Formato: "Nombre,email;Nombre2,email2"');
    process.exit(1);
  }

  const results: Array<{ name: string; email: string; status: string; resetUrl?: string }> = [];

  for (const { name, email } of teacherPairs) {
    try {
      // Check if teacher already exists
      const existing = await prisma.teacher.findUnique({ where: { email } });

      if (existing) {
        // Link to institution if not already linked
        if (existing.institution_id !== institutionId) {
          await prisma.teacher.update({
            where: { id: existing.id },
            data: { institution_id: institutionId },
          });
          results.push({ name, email, status: 'vinculado (ya existía)' });
        } else {
          results.push({ name, email, status: 'ya vinculado' });
        }
        continue;
      }

      // Generate temporary password and reset token
      const tempPassword = crypto.randomBytes(8).toString('hex');
      const passwordHash = await bcrypt.hash(tempPassword, 10);
      const resetToken = crypto.randomUUID();
      const resetTokenExp = new Date();
      resetTokenExp.setDate(resetTokenExp.getDate() + 7); // 7 days to set password

      const teacher = await prisma.teacher.create({
        data: {
          email,
          password_hash: passwordHash,
          name,
          is_verified: true, // Institutional accounts are pre-verified
          institution_id: institutionId,
          reset_token: resetToken,
          reset_token_exp: resetTokenExp,
        },
      });

      const resetUrl = `${FRONTEND_URL}/reset-password?token=${resetToken}`;
      results.push({ name, email, status: 'creado', resetUrl });

    } catch (err) {
      results.push({ name, email, status: `error: ${err instanceof Error ? err.message : String(err)}` });
    }
  }

  // Print results
  console.log('\nResultados:');
  console.log('─'.repeat(80));
  for (const r of results) {
    console.log(`  ${r.name} <${r.email}> → ${r.status}`);
    if (r.resetUrl) {
      console.log(`    URL para establecer contraseña: ${r.resetUrl}`);
    }
  }
  console.log('─'.repeat(80));
  console.log(`Total: ${results.length} profesores procesados`);
  console.log(`\nNota: Envía las URLs de reset a cada profesor para que establezcan su contraseña.`);
}

// ============================================
// LIST INSTITUTIONS
// ============================================

async function listInstitutions() {
  const institutions = await prisma.institution.findMany({
    include: {
      subscription: true,
      _count: { select: { teachers: true } },
    },
    orderBy: { created_at: 'desc' },
  });

  if (institutions.length === 0) {
    console.log('\nNo hay instituciones registradas.');
    return;
  }

  console.log('\nInstituciones:');
  console.log('─'.repeat(90));
  for (const inst of institutions) {
    const sub = inst.subscription[0];
    const subStatus = sub ? `${sub.status} (hasta ${sub.period_end.toLocaleDateString('es-CL')})` : 'Sin suscripción';
    console.log(`  ${inst.id}`);
    console.log(`    ${inst.name} | ${inst._count.teachers} profesores | $${inst.plan_price}/prof/mes`);
    console.log(`    Contacto: ${inst.contact_name} <${inst.contact_email}>`);
    console.log(`    Suscripción: ${subStatus}`);
    console.log('');
  }
}

// ============================================
// INSTITUTION STATUS
// ============================================

async function institutionStatus(args: Record<string, string>) {
  const institutionId = args['institution-id'];

  if (!institutionId) {
    console.error('Uso: status --institution-id <id>');
    process.exit(1);
  }

  const institution = await prisma.institution.findUnique({
    where: { id: institutionId },
    include: {
      subscription: true,
      teachers: {
        select: {
          id: true,
          name: true,
          email: true,
          is_verified: true,
          created_at: true,
          usage_counters: {
            orderBy: { period_start: 'desc' },
            take: 1,
          },
        },
      },
    },
  });

  if (!institution) {
    console.error(`Institución no encontrada: ${institutionId}`);
    process.exit(1);
  }

  console.log(`\n${institution.name}`);
  console.log(`Contacto: ${institution.contact_name} <${institution.contact_email}>`);
  console.log(`Precio: $${institution.plan_price}/prof/mes`);

  const sub = institution.subscription[0];
  if (sub) {
    console.log(`Suscripción: ${sub.status} | ${sub.period_start.toLocaleDateString('es-CL')} → ${sub.period_end.toLocaleDateString('es-CL')}`);
  }

  console.log(`\nProfesores (${institution.teachers.length}):`);
  console.log('─'.repeat(90));
  for (const t of institution.teachers) {
    const usage = t.usage_counters[0];
    const usageStr = usage ? `${usage.student_attempts} intentos, ${usage.pdf_analyses} PDFs` : 'sin uso';
    console.log(`  ${t.name} <${t.email}> | verificado: ${t.is_verified ? 'sí' : 'no'} | uso mes: ${usageStr}`);
  }
}

// ============================================
// SET INSTITUTION ADMIN
// ============================================

async function setAdmin(args: Record<string, string>) {
  const email = args['email'];

  if (!email) {
    console.error('Uso: set-admin --email profesor@colegio.cl');
    process.exit(1);
  }

  const teacher = await prisma.teacher.findUnique({
    where: { email },
    include: { institution: true },
  });

  if (!teacher) {
    console.error(`Profesor no encontrado: ${email}`);
    process.exit(1);
  }

  if (!teacher.institution_id) {
    console.error(`El profesor ${email} no está vinculado a ninguna institución`);
    process.exit(1);
  }

  await prisma.teacher.update({
    where: { id: teacher.id },
    data: { is_institution_admin: true },
  });

  console.log(`\nAdmin configurado:`);
  console.log(`  Profesor: ${teacher.name} <${teacher.email}>`);
  console.log(`  Institución: ${teacher.institution?.name || teacher.institution_id}`);
  console.log(`  is_institution_admin: true`);
}

// ============================================
// MAIN
// ============================================

async function main() {
  const args = parseArgs();
  const command = args._command;

  try {
    switch (command) {
      case 'create':
        await createInstitution(args);
        break;
      case 'add-teachers':
        await addTeachers(args);
        break;
      case 'list':
        await listInstitutions();
        break;
      case 'status':
        await institutionStatus(args);
        break;
      case 'set-admin':
        await setAdmin(args);
        break;
      default:
        console.log('Comandos disponibles:');
        console.log('  create        Crear nueva institución con suscripción');
        console.log('  add-teachers  Agregar profesores a una institución');
        console.log('  list          Listar todas las instituciones');
        console.log('  status        Ver estado detallado de una institución');
        console.log('  set-admin     Marcar un profesor como admin de su institución');
        break;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
