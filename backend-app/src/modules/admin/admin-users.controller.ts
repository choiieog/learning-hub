import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UsersService } from '../users/users.service';
import { AdminListUsersQueryDto } from './dto/admin-list-users-query.dto';
import { WarnUserDto } from './dto/warn-user.dto';

/** Quản lý tài khoản (admin): /api/admin/users/* */
@Controller('admin/users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminUsersController {
  constructor(private readonly usersService: UsersService) {}

  /** GET /api/admin/users?keyword=&role=&status= */
  @Get()
  findAll(@Query() query: AdminListUsersQueryDto) {
    return this.usersService.findAllForAdmin(query);
  }

  /** GET /api/admin/users/:id — chi tiết + lịch sử cảnh báo */
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findDetailForAdmin(id);
  }

  /** POST /api/admin/users/:id/warnings — gửi cảnh báo kèm lý do */
  @Post(':id/warnings')
  warn(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Body() dto: WarnUserDto,
  ) {
    return this.usersService.warn(id, adminId, dto.reason);
  }
}
