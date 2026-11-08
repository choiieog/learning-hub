import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import configuration from '../../config/configuration';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { CreateDocumentDto } from './dto/create-document.dto';
import { ListDocumentsQueryDto } from './dto/list-documents-query.dto';
import { ResubmitDocumentDto } from './dto/resubmit-document.dto';
import { DocumentsService } from './documents.service';

const rateLimit = configuration().rateLimit;

/**
 * Tài liệu phía người dùng: /api/documents/*
 * Duyệt / từ chối / xóa vi phạm nằm ở modules/admin/admin-documents.controller.ts
 */
@Controller('documents')
@UseGuards(JwtAuthGuard)
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  /** GET /api/documents — chỉ tài liệu APPROVED, hỗ trợ tìm kiếm + lọc nhiều lựa chọn */
  @Get()
  findAll(@Query() query: ListDocumentsQueryDto) {
    return this.documentsService.findAll(query);
  }

  /**
   * GET /api/documents/mine — tài liệu tôi đã chia sẻ (mọi trạng thái).
   * Phải khai báo TRƯỚC ':id', nếu không Nest sẽ hiểu "mine" là id.
   */
  @Get('mine')
  findMine(@CurrentUser('id') userId: string, @Query() query: ListDocumentsQueryDto) {
    return this.documentsService.findMine(userId, query);
  }

  /**
   * GET /api/documents/:id — chi tiết.
   * Mỗi lượt xem được ghi nhận tại đây (xem DocumentsService.findOneAndRegisterView).
   */
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() viewer: AuthenticatedUser) {
    return this.documentsService.findOneAndRegisterView(id, viewer);
  }

  /** POST /api/documents — đăng tài liệu, vào trạng thái PENDING chờ admin duyệt */
  @Post()
  @RateLimit({
    limit: rateLimit.documentCreate.limit,
    windowMs: rateLimit.documentCreate.windowMs,
    message: 'Bạn đăng tài liệu quá nhanh. Vui lòng thử lại sau ít phút.',
  })
  create(@CurrentUser('id') authorId: string, @Body() dto: CreateDocumentDto) {
    return this.documentsService.create(authorId, dto);
  }

  /** PATCH /api/documents/:id — chủ bài sửa bài bị từ chối rồi gửi duyệt lại (→ PENDING) */
  @Patch(':id')
  resubmit(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: ResubmitDocumentDto,
  ) {
    return this.documentsService.resubmit(id, userId, dto);
  }

  /** DELETE /api/documents/:id — sinh viên tự xóa tài liệu của mình (xóa mềm) */
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.documentsService.removeOwn(id, userId);
  }
}
