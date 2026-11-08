import { BadRequestException, Injectable, PayloadTooLargeException } from '@nestjs/common';
import { extname } from 'node:path';
import {
  MIME_BY_EXTENSION,
  UPLOAD_FOLDERS,
  type UploadFolder,
  maxUploadSizeBytes,
} from '../../common/constants/upload.constants';
import { StorageService } from '../../infra/storage/storage.service';
import type { StoredFile } from '../../infra/storage/storage.types';
import type { UploadedFileLike } from './uploads.controller';

/**
 * Kiểm tra file tải lên (thư mục, dung lượng, đuôi ↔ MIME) rồi giao việc lưu cho `StorageService`.
 *
 * Nơi lưu thật do `STORAGE_DRIVER` quyết định (hiện có `local`); service này không biết
 * file nằm ở đĩa hay cloud nên đổi driver không phải sửa nghiệp vụ.
 */
@Injectable()
export class UploadsService {
  private readonly maxSizeBytes = maxUploadSizeBytes();

  constructor(private readonly storage: StorageService) {}

  async upload(file: UploadedFileLike | undefined, folder: string): Promise<StoredFile> {
    if (!file || !file.buffer?.length) {
      throw new BadRequestException('Thiếu file — gửi multipart với field tên "file".');
    }

    if (!UPLOAD_FOLDERS.includes(folder as UploadFolder)) {
      throw new BadRequestException(`Thư mục không hợp lệ, chỉ nhận: ${UPLOAD_FOLDERS.join(', ')}.`);
    }

    if (file.size > this.maxSizeBytes) {
      throw new PayloadTooLargeException(
        `File vượt quá ${Math.round(this.maxSizeBytes / 1024 / 1024)}MB.`,
      );
    }

    const extension = extname(file.originalname).slice(1).toLowerCase();
    const expectedMimeType = MIME_BY_EXTENSION[extension];
    if (!expectedMimeType) {
      throw new BadRequestException(
        'Chỉ nhận file PDF, DOCX, PPTX (tài liệu) hoặc PNG, JPG, WEBP (ảnh).',
      );
    }

    // Đuôi file phải khớp MIME thật để không nhận .exe đổi tên thành .pdf.
    if (file.mimetype !== expectedMimeType) {
      throw new BadRequestException(
        `Nội dung file không khớp định dạng .${extension} (nhận ${file.mimetype}).`,
      );
    }

    return this.storage.upload(
      { buffer: file.buffer, originalName: file.originalname, mimeType: expectedMimeType },
      folder as UploadFolder,
    );
  }
}
