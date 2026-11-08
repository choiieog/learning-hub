import { Module } from '@nestjs/common';
import { AdminSettingsController } from './admin-settings.controller';
import { SettingsService } from './settings.service';

@Module({
  controllers: [AdminSettingsController],
  providers: [SettingsService],
  exports: [SettingsService], // DocumentsModule đọc giới hạn đăng bài/ngày
})
export class SettingsModule {}
