import { Module } from '@nestjs/common';
import { GamificationService } from './gamification.service';
import { LeaderboardController } from './leaderboard.controller';

@Module({
  controllers: [LeaderboardController],
  providers: [GamificationService],
  exports: [GamificationService], // documents / ratings cộng EXP qua service này
})
export class GamificationModule {}
