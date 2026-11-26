import { execFileSync } from 'node:child_process';
import { Client } from 'pg';
import {
  databaseNameFromUrl,
  loadEnvironment,
  pgConnectionUrl,
  resolveE2eDatabaseUrl,
} from './e2e-database';

async function main(): Promise<void> {
  loadEnvironment();

  const testUrl = resolveE2eDatabaseUrl();
  const databaseName = databaseNameFromUrl(testUrl);

  // Kết nối vào database admin để tạo database test nếu chưa có.
  const adminUrl = new URL(pgConnectionUrl(testUrl));
  adminUrl.pathname = '/postgres';

  const client = new Client({ connectionString: adminUrl.toString() });

  await client.connect();

  try {
    const existing = await client.query('select 1 from pg_database where datname = $1', [
      databaseName,
    ]);

    if ((existing.rowCount ?? 0) === 0) {
      const quotedName = `"${databaseName.replace(/"/g, '""')}"`;
      await client.query(`create database ${quotedName}`);
      console.log(`Đã tạo database e2e: ${databaseName}`);
    } else {
      console.log(`Dùng database e2e: ${databaseName}`);
    }
  } finally {
    await client.end();
  }

  // Reset schema và chạy migrations. Prisma 7 không còn --skip-seed, nên xoá
  // toàn bộ bảng ứng dụng ngay sau đó để chắc chắn không còn seed/data cũ.
  execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', [
    'prisma',
    'migrate',
    'reset',
    '--force',
  ], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: 'inherit',
  });

  const testClient = new Client({ connectionString: pgConnectionUrl(testUrl) });
  await testClient.connect();

  try {
    const tables = await testClient.query<{ tablename: string }>(
      "select tablename from pg_tables where schemaname = 'public' and tablename <> '_prisma_migrations'",
    );
    const names = tables.rows.map(({ tablename }) => `"${tablename.replace(/"/g, '""')}"`);

    if (names.length > 0) {
      await testClient.query(`truncate table ${names.join(', ')} restart identity cascade`);
    }

    console.log(`Đã reset database e2e trống: ${databaseName}`);
  } finally {
    await testClient.end();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
