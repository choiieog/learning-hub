import { Controller, Get, UseGuards } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AdminService } from './admin.service';

@Controller('admin/dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminDashboardController {
  constructor(private readonly adminService: AdminService) {}

  /** GET /api/admin/dashboard/overview — thẻ số liệu cho trang tổng quan admin */
  @Get('overview')
  getOverview() {
    return this.adminService.getOverview();
  }
}
