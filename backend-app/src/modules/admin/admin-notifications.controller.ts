import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { NotificationsService } from '../notifications/notifications.service';
import { BroadcastNotificationDto } from './dto/broadcast-notification.dto';

/** Thông báo hàng loạt của admin: /api/admin/notifications/* */
@Controller('admin/notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminNotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /**
   * POST /api/admin/notifications/broadcast
   * Tạo một thông báo `userId = null` — mọi sinh viên thấy trong chuông và trang /notifications.
   */
  @Post('broadcast')
  broadcast(@Body() dto: BroadcastNotificationDto) {
    return this.notificationsService.broadcast(dto);
  }
}
