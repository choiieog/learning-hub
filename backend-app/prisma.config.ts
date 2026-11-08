import { defineConfig, env } from 'prisma/config';

// Node's built-in .env loader (the Prisma CLI evaluates this file before connecting).
try {
  process.loadEnvFile('.env');
} catch {
  // .env is optional in CI, where variables come from the environment.
}

/**
 * Prisma 7 project configuration (see docs/DECISIONS.md section 1).
 * Commands: npm run db:generate | db:migrate | db:seed
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    // tsx (not ts-node) because the generated Prisma 7 client imports `*.js` paths.
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
