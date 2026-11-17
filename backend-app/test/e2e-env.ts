import { mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseEnv } from 'node:util';

/**
 * Loads `.env` for e2e tests: jest does not run main.ts, so nothing else reads it.
 * `parseEnv` (Node 22+) doesn't throw on the whole file, and existing variables
 * win — CI/prefixed env (`DATABASE_URL=... npm run test:e2e`) keeps its values.
 */
try {
  const parsed = parseEnv(readFileSync('.env', 'utf8'));

  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
} catch {
  // No .env file: variables come from the environment.
}

// E2E ghi file tải lên vào thư mục tạm, không vào `backend-app/uploads` của dev.
// Tên cố định để `e2e-teardown.cjs` (chạy ở tiến trình chính của jest) xoá được sau khi
// xong: worker của jest bị kill nên handler `exit` trong tiến trình con không đáng tin.
const uploadDir = join(tmpdir(), 'lh-e2e-uploads');

mkdirSync(uploadDir, { recursive: true });
process.env.UPLOAD_DIR = uploadDir;
