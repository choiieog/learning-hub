import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { CreateSubjectDto } from '../subjects/dto/create-subject.dto';
import { SubjectsService } from '../subjects/subjects.service';

/** Danh mục môn học (admin): /api/admin/subjects/* */
@Controller('admin/subjects')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminSubjectsController {
  constructor(private readonly subjectsService: SubjectsService) {}

  /** GET /api/admin/subjects — kèm documentCount */
  @Get()
  findAll(@Query() query: PaginationQueryDto) {
    return this.subjectsService.findAll(query);
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
