import { Module } from '@nestjs/common';
import { FilesController } from './files.controller';

/**
 * Phục vụ tệp upload (avatars công khai, tài liệu kiểm tra trạng thái duyệt).
 * PrismaModule và JwtModule là global nên không cần import lại.
 */
@Module({
  controllers: [FilesController],
})
export class FilesModule {}
