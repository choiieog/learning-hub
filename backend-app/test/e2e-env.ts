import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadEnvironment, resolveE2eDatabaseUrl } from './e2e-database';

loadEnvironment();

// Jest không chạy main.ts; trỏ app vào database test đã được prepare-e2e-db.ts
// tạo và migrate trước khi bắt đầu suite.
process.env.DATABASE_URL = resolveE2eDatabaseUrl();

// E2E ghi file tải lên vào thư mục tạm, không vào `backend-app/uploads` của dev.
// Tên cố định để `e2e-teardown.cjs` (chạy ở tiến trình chính của jest) xoá được sau khi
// xong: worker của jest bị kill nên handler `exit` trong tiến trình con không đáng tin.
const uploadDir = join(tmpdir(), 'lh-e2e-uploads');

mkdirSync(uploadDir, { recursive: true });
process.env.UPLOAD_DIR = uploadDir;
