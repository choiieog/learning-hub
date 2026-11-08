import { Module } from '@nestjs/common';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';

/**
 * Upload file dùng chung (tài liệu + avatar).
 * Việc lưu file do `StorageService` (src/infra/storage, global) đảm nhận theo `STORAGE_DRIVER`.
 */
@Module({
  controllers: [UploadsController],
  providers: [UploadsService],
  exports: [UploadsService],
})
export class UploadsModule {}
