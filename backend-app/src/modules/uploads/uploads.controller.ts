import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { maxUploadSizeBytes } from '../../common/constants/upload.constants';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { UploadsService } from './uploads.service';

/** Kiểu tối thiểu của file Multer (tránh phải cài @types/multer). */
export interface UploadedFileLike {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/**
 * POST /api/uploads — multipart/form-data:
 *   file   file cần lưu (bắt buộc)
 *   folder "documents" (mặc định) | "avatars"
 *
 * Trả { url, publicId, name, size, mimeType } để lưu vào Document files / avatar.
 */
@Controller('uploads')
@UseGuards(JwtAuthGuard)
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post()
  @UseInterceptors(
    // Multer chặn sớm khi file quá lớn (→ 413) trước khi buffer cả file vào RAM.
    FileInterceptor('file', { limits: { fileSize: maxUploadSizeBytes(), files: 1 } }),
  )
  upload(@UploadedFile() file: UploadedFileLike | undefined, @Body('folder') folder?: string) {
    if (folder !== undefined && typeof folder !== 'string') {
      throw new BadRequestException('Tham số folder không hợp lệ.');
    }

    return this.uploadsService.upload(file, folder ?? 'documents');
  }
}
