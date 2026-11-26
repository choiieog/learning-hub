import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CreateSubjectDto } from '../subjects/dto/create-subject.dto';
import { SubjectsService } from '../subjects/subjects.service';
import type { AdminSubjectSummary } from '../subjects/subjects.service';

/** Danh mục môn học (admin): /api/admin/subjects/* */
@Controller('admin/subjects')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminSubjectsController {
  constructor(private readonly subjectsService: SubjectsService) {}

  /** GET /api/admin/subjects — documentCount gồm mọi trạng thái (kể cả chờ duyệt) */
  @Get()
  findAll(): Promise<AdminSubjectSummary[]> {
    return this.subjectsService.findAllForAdmin();
  }

  /** POST /api/admin/subjects */
  @Post()
  create(@Body() dto: CreateSubjectDto) {
    return this.subjectsService.create(dto);
  }

  /** DELETE /api/admin/subjects/:id — từ chối nếu môn còn tài liệu */
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.subjectsService.remove(id);
  }
}
