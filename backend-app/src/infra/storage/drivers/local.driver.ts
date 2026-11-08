import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { UPLOAD_URL_PREFIX, type UploadFolder } from '../../../common/constants/upload.constants';
import type { StorageDriver, StorageUploadInput, StoredFile } from '../storage.types';

/**
 * Lưu file vào `UPLOAD_DIR` và phục vụ qua `useStaticAssets` ở main.ts (prefix `/api/files`).
 *
 * Tên file do server sinh (uuid + phần mở rộng) để không phụ thuộc tên người dùng gửi lên:
 * tránh ghi đè, path traversal và ký tự lạ trên URL.
 */
@Injectable()
export class LocalStorageDriver implements StorageDriver {
  readonly name = 'local';

  private readonly uploadRoot = resolve(process.env.UPLOAD_DIR ?? './uploads');

  async upload(input: StorageUploadInput, folder: UploadFolder): Promise<StoredFile> {
    const extension = extname(input.originalName).slice(1).toLowerCase();
    const publicId = `${folder}/${randomUUID()}.${extension}`;
    const targetPath = this.resolveInsideRoot(publicId);

    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, input.buffer);

    return {
      url: `${UPLOAD_URL_PREFIX}/${publicId}`,
      publicId,
      name: input.originalName,
      size: input.buffer.length,
      mimeType: input.mimeType,
    };
  }

  async remove(publicId: string): Promise<void> {
    // `force` để xoá file đã mất vẫn thành công (idempotent).
    await rm(this.resolveInsideRoot(publicId), { force: true });
  }

  /** `publicId` có thể đến từ client khi xoá, nên không được thoát khỏi UPLOAD_DIR. */
  private resolveInsideRoot(publicId: string): string {
    const targetPath = resolve(this.uploadRoot, publicId);

    if (!targetPath.startsWith(`${this.uploadRoot}${sep}`)) {
      throw new BadRequestException('Đường dẫn file không hợp lệ.');
    }

    return targetPath;
  }
}
