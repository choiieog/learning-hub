import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { DocumentsService } from '../documents/documents.service';
import { ListDocumentsQueryDto } from '../documents/dto/list-documents-query.dto';
import { RejectDocumentDto } from './dto/reject-document.dto';

/** Phê duyệt bài viết: /api/admin/documents/* */
@Controller('admin/documents')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminDocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  /** GET /api/admin/documents?status=PENDING — hàng chờ duyệt */
  @Get()
  findAll(@Query() query: ListDocumentsQueryDto) {
    return this.documentsService.findForModeration(query);
  }

  /** PATCH /api/admin/documents/:id/approve */
  @Patch(':id/approve')
  approve(@Param('id') id: string) {
    return this.documentsService.approve(id);
  }

  /** PATCH /api/admin/documents/:id/reject — từ chối = xoá hẳn, lý do gửi cho tác giả */
  @Patch(':id/reject')
  reject(@Param('id') id: string, @Body() dto: RejectDocumentDto) {
    return this.documentsService.reject(id, dto.reason);
  }

  /** DELETE /api/admin/documents/:id — xóa tài liệu vi phạm */
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.documentsService.removeByAdmin(id);
  }
}
