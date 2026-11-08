import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { SubjectsModule } from '../subjects/subjects.module';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';

@Module({
  // SubjectsModule: kiểm tra subjectId tồn tại; NotificationsModule: báo cho tác giả khi duyệt / từ chối
  imports: [SubjectsModule, NotificationsModule],
  controllers: [DocumentsController],
  providers: [DocumentsService],
  exports: [DocumentsService], // AdminModule dùng cho duyệt / từ chối / xóa
})
export class DocumentsModule {}
