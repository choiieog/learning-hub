import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService], // DocumentsModule dùng để báo cho tác giả khi duyệt / từ chối
})
export class NotificationsModule {}
