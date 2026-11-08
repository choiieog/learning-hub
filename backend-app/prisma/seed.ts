import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '../src/generated/prisma/client';

// Loaded by prisma.config.ts when run through `npx prisma db seed`;
// loaded here as a fallback when the file is executed directly.
try {
  process.loadEnvFile('.env');
} catch {
  // .env is optional in CI.
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
});

const BCRYPT_ROUNDS = 10;

/**
 * Seeds one verified admin account and a few subjects.
 * Idempotent: re-running it never duplicates rows.
 *
 * Dev credentials come from SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD,
 * with safe local defaults.
 */
async function main() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@learninghub.local').toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@12345';

  const admin = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
      fullName: 'Quản trị viên',
      role: 'ADMIN',
      emailVerifiedAt: new Date(),
    },
  });

  const subjects = [
    { code: 'INT2204', name: 'Lập trình hướng đối tượng' },
    { code: 'INT2208', name: 'Công nghệ phần mềm' },
    { code: 'MAT1093', name: 'Đại số tuyến tính' },
    { code: 'MAT1203', name: 'Giải tích 1' },
    { code: 'PHY1100', name: 'Vật lý đại cương 1' },
  ];

  for (const subject of subjects) {
    await prisma.subject.upsert({
      where: { code: subject.code },
      update: { name: subject.name },
      create: subject,
    });
  }

  console.log(`Seeded admin ${admin.email} and ${subjects.length} subjects.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
