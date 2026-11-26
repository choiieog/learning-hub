import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

/** Nạp `.env` giống e2e-env cũ; biến đã có trong process.env luôn thắng. */
export function loadEnvironment(): void {
  try {
    const parsed = parseEnv(readFileSync('.env', 'utf8'));

    for (const [key, value] of Object.entries(parsed)) {
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch {
    // Không có .env: dùng biến môi trường của CI/shell.
  }
}

/**
 * E2E luôn chạy trên database riêng, mặc định `<database>_test`.
 * `E2E_DATABASE_URL` cho phép chỉ định database test khác khi cần.
 */
export function resolveE2eDatabaseUrl(): string {
  const baseUrl = process.env.DATABASE_URL;

  if (!baseUrl) {
    throw new Error('Thiếu DATABASE_URL để xác định database test cho e2e.');
  }

  const base = new URL(baseUrl);
  const baseDatabase = databaseNameFromUrl(baseUrl);

  if (!baseDatabase) {
    throw new Error('DATABASE_URL phải trỏ tới một database có tên.');
  }

  const explicit = process.env.E2E_DATABASE_URL;
  const test = explicit ? new URL(explicit) : new URL(base);

  if (!explicit) {
    test.pathname = `/${baseDatabase}_test`;
  }

  const testDatabase = databaseNameFromUrl(test.toString());

  if (!testDatabase) {
    throw new Error('E2E_DATABASE_URL phải trỏ tới một database có tên.');
  }

  if (testDatabase === baseDatabase) {
    throw new Error('Database e2e phải khác database dev (DATABASE_URL).');
  }

  if (['postgres', 'template0', 'template1'].includes(testDatabase)) {
    throw new Error('Không được dùng database hệ thống làm database e2e.');
  }

  return test.toString();
}

/**
 * pg không hiểu query `schema` của Prisma, nhưng vẫn cần giữ các query khác
 * như `sslmode` khi kết nối database test.
 */
export function pgConnectionUrl(urlString: string): string {
  const url = new URL(urlString);
  url.searchParams.delete('schema');
  return url.toString();
}

export function databaseNameFromUrl(urlString: string): string {
  return decodeURIComponent(new URL(urlString).pathname.replace(/^\//, ''));
}
