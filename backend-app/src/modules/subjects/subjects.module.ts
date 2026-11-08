import { Module } from '@nestjs/common';
import { SubjectsController } from './subjects.controller';
import { SubjectsService } from './subjects.service';

@Module({
  controllers: [SubjectsController],
  providers: [SubjectsService],
  exports: [SubjectsService], // Documents + Admin dùng để kiểm tra/CRUD môn học
})
export class SubjectsModule {}
