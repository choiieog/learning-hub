import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { UsersService } from './users.service';

/** Danh sách khung avatar + trạng thái mở khoá theo level: /api/avatar-frames */
@Controller('avatar-frames')
@UseGuards(JwtAuthGuard)
export class AvatarFramesController {
  constructor(private readonly usersService: UsersService) {}

  /** GET /api/avatar-frames — mọi khung, kèm `unlocked` theo level người gọi. */
  @Get()
  list(@CurrentUser('id') userId: string) {
    return this.usersService.listAvatarFrames(userId);
  }
}
