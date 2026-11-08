import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { LeaderboardQueryDto } from './dto/leaderboard-query.dto';
import { GamificationService } from './gamification.service';

/** Bảng xếp hạng sinh viên theo EXP/level: /api/leaderboard */
@Controller('leaderboard')
@UseGuards(JwtAuthGuard)
export class LeaderboardController {
  constructor(private readonly gamification: GamificationService) {}

  /** GET /api/leaderboard?limit=10 — top sinh viên + vị trí của người gọi. */
  @Get()
  getLeaderboard(@CurrentUser('id') userId: string, @Query() query: LeaderboardQueryDto) {
    return this.gamification.leaderboard(userId, query.limit);
  }
}
