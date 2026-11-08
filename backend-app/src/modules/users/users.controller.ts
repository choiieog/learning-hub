import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { UpdateAvatarDto } from './dto/update-avatar.dto';
import { UpdateAvatarFrameDto } from './dto/update-avatar-frame.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UsersService } from './users.service';

/** Route người dùng đang đăng nhập: /api/users/* */
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /** GET /api/users/me */
  @Get('me')
  getMe(@CurrentUser('id') userId: string) {
    return this.usersService.findById(userId);
  }

  /** PATCH /api/users/me */
  @Patch('me')
  updateMe(@CurrentUser('id') userId: string, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(userId, dto);
  }

  /**
   * PATCH /api/users/me/avatar
   * Luồng: POST /api/uploads (file ảnh) → lấy url → gọi route này với { avatarUrl }.
   */
  @Patch('me/avatar')
  updateAvatar(@CurrentUser('id') userId: string, @Body() dto: UpdateAvatarDto) {
    return this.usersService.updateAvatar(userId, dto.avatarUrl);
  }

  /** PATCH /api/users/me/avatar-frame — chọn/bỏ khung avatar đã mở theo level */
  @Patch('me/avatar-frame')
  updateAvatarFrame(@CurrentUser('id') userId: string, @Body() dto: UpdateAvatarFrameDto) {
    return this.usersService.setAvatarFrame(userId, dto.frameId ?? null);
  }

  /** GET /api/users/:id — hồ sơ công khai + level (không lộ email) */
  @Get(':id')
  getPublicProfile(@Param('id') id: string) {
    return this.usersService.getPublicProfile(id);
  }
}
