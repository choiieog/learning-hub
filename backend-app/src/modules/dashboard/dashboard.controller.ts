import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { DashboardService } from './dashboard.service';

/**
 * Tổng quan phía người dùng: /api/dashboard/*
 * Chỉ trả số liệu của chính người đang đăng nhập.
 */
@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  /** GET /api/dashboard/overview — thẻ số liệu + tài liệu gần đây + top tài liệu. */
  @Get('overview')
  getOverview(@CurrentUser('id') userId: string) {
    return this.dashboardService.getOverview(userId);
  }
}
