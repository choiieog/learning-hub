const { rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

/**
 * Dọn thư mục upload tạm của e2e sau khi chạy xong (`test/e2e-env.ts` trỏ `UPLOAD_DIR` vào đây),
 * kể cả thư mục còn sót lại từ lần chạy trước bị treo. Chạy ở tiến trình chính của jest nên
 * không phụ thuộc việc worker bị kill.
 */
module.exports = async () => {
  rmSync(join(tmpdir(), 'lh-e2e-uploads'), { recursive: true, force: true });
};
