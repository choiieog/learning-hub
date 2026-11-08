import { Module } from '@nestjs/common';
import { GamificationModule } from '../gamification/gamification.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SettingsModule } from '../settings/settings.module';
import { SubjectsModule } from '../subjects/subjects.module';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';

@Module({
  // SubjectsModule: kiểm tra subjectId tồn tại; NotificationsModule: báo cho tác giả khi duyệt / từ chối;
  // GamificationModule: cộng EXP cho lượt xem và bài được duyệt; SettingsModule: giới hạn bài/ngày.
  imports: [SubjectsModule, NotificationsModule, GamificationModule, SettingsModule],
  controllers: [DocumentsController],
  providers: [DocumentsService],
  exports: [DocumentsService], // AdminModule dùng cho duyệt / từ chối / xóa
})
export class DocumentsModule {}
