import { Module } from '@nestjs/common';
import { GamificationModule } from '../gamification/gamification.module';
import { RatingsController } from './ratings.controller';
import { RatingsService } from './ratings.service';

@Module({
  // GamificationModule: đánh giá mới cộng EXP cho tác giả.
  imports: [GamificationModule],
  controllers: [RatingsController],
  providers: [RatingsService],
  exports: [RatingsService],
})
export class RatingsModule {}
