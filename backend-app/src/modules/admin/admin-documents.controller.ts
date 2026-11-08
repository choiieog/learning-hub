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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
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
  approve(@Param('id') id: string, @CurrentUser('id') adminId: string) {
    return this.documentsService.approve(id, adminId);
  }

  /** PATCH /api/admin/documents/:id/reject — kèm lý do để báo cho tác giả (phase 2) */
  @Patch(':id/reject')
  reject(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Body() dto: RejectDocumentDto,
  ) {
    return this.documentsService.reject(id, adminId, dto.reason);
  }

  /** DELETE /api/admin/documents/:id — xóa tài liệu vi phạm */
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser('id') adminId: string) {
    return this.documentsService.removeByAdmin(id, adminId);
  }
}
