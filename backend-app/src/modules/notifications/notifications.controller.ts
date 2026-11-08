import { Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import { NotificationsService } from './notifications.service';

/** Thông báo phía người dùng: /api/notifications/* */
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /** GET /api/notifications — thông báo của tôi + thông báo chung, kèm unreadCount. */
  @Get()
  findMine(@CurrentUser('id') userId: string, @Query() query: ListNotificationsQueryDto) {
    return this.notificationsService.findMine(userId, query);
  }

  /** PATCH /api/notifications/read-all — đánh dấu đọc tất cả thông báo cá nhân. */
  @Patch('read-all')
  markAllRead(@CurrentUser('id') userId: string) {
    return this.notificationsService.markAllRead(userId);
  }

  /** PATCH /api/notifications/:id/read */
  @Patch(':id/read')
  markRead(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.notificationsService.markRead(id, userId);
  }
}
