import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { UpsertRatingDto } from './dto/upsert-rating.dto';
import { RatingsService } from './ratings.service';

/**
 * Đánh giá sao của một tài liệu: /api/documents/:documentId/ratings
 *
 * Chỉ tài liệu APPROVED mới nhận đánh giá; mỗi người một đánh giá (gửi lại là cập nhật).
 * Tác giả không tự đánh giá bài của mình.
 */
@Controller('documents/:documentId/ratings')
@UseGuards(JwtAuthGuard)
export class RatingsController {
  constructor(private readonly ratingsService: RatingsService) {}

  /** GET — danh sách + phân bố sao + đánh giá hiện tại của người gọi. */
  @Get()
  list(
    @Param('documentId') documentId: string,
    @CurrentUser('id') userId: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.ratingsService.list(documentId, userId, query);
  }

  /** POST — gửi đánh giá mới hoặc cập nhật đánh giá cũ của chính mình. */
  @Post()
  upsert(
    @Param('documentId') documentId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpsertRatingDto,
  ) {
    return this.ratingsService.upsert(documentId, userId, dto);
  }
}
