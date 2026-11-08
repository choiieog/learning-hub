import { Controller, Get, Param, Query } from '@nestjs/common';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { SubjectsService } from './subjects.service';

/**
 * Đọc danh mục môn học (mọi người dùng đã đăng nhập).
 * Thêm/xóa môn học do admin làm: modules/admin/admin-subjects.controller.ts
 */
@Controller('subjects')
export class SubjectsController {
  constructor(private readonly subjectsService: SubjectsService) {}

  /** GET /api/subjects — kèm documentCount để hiển thị bộ lọc */
  @Get()
  findAll(@Query() query: PaginationQueryDto) {
    return this.subjectsService.findAll(query);
  }

  /** GET /api/subjects/:id */
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.subjectsService.findOne(id);
  }
}
