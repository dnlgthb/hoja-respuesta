import dotenv from 'dotenv';
dotenv.config();

import { PrismaClient } from '../generated/prisma';
const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2];
  const institutionId = process.argv[3];

  if (!email || !institutionId) {
    console.error('Uso: npx tsx scripts/link-teacher-institution.ts <email> <institutionId>');
    process.exit(1);
  }

  const teacher = await prisma.teacher.update({
    where: { email },
    data: { institution_id: institutionId },
    select: { id: true, name: true, email: true, institution_id: true, is_beta: true },
  });

  console.log('Cuenta asociada a institución:', teacher);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('Error:', e);
  prisma.$disconnect();
  process.exit(1);
});
