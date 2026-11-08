import { Injectable, NotFoundException } from '@nestjs/common';
import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from '../../common/dto/pagination-query.dto';
import { DocumentStatus } from '../../common/enums/document-status.enum';
import { ExpReason, Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { EXP_RULES } from '../gamification/gamification.constants';
import { GamificationService } from '../gamification/gamification.service';
import { UpsertRatingDto } from './dto/upsert-rating.dto';

const RATING_SELECT = {
  id: true,
  stars: true,
  comment: true,
  createdAt: true,
  updatedAt: true,
  user: { select: { id: true, fullName: true, avatarUrl: true, level: true } },
} satisfies Prisma.RatingSelect;

export interface RatingSummary {
  ratingAvg: number;
  ratingCount: number;
  /** Số lượt theo từng mức sao, dùng để vẽ biểu đồ phân bố. */
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
}

export interface RatingItem {
  id: string;
  stars: number;
  comment: string | null;
  createdAt: Date;
  updatedAt: Date;
  user: { id: string; fullName: string; avatarUrl: string | null; level: number };
}

export interface PaginatedRatings {
  items: RatingItem[];
  meta: { page: number; limit: number; total: number; totalPages: number };
  summary: RatingSummary;
  /** Đánh giá hiện tại của người gọi (null nếu chưa đánh giá). */
  myRating: RatingItem | null;
}

export interface UpsertRatingResult {
  rating: RatingItem;
  ratingAvg: number;
  ratingCount: number;
}

/**
 * Đánh giá sao tài liệu (phase 2).
 *
 * Mỗi người chỉ có một đánh giá cho mỗi tài liệu (`@@unique([documentId, userId])`);
 * gửi lại là cập nhật. Sau mỗi lần ghi, cache `Document.ratingAvg` / `ratingCount`
 * được tính lại trong cùng transaction để danh sách và sắp xếp theo `ratingAvg` luôn đúng.
 */
@Injectable()
export class RatingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gamification: GamificationService,
  ) {}

  /** Danh sách đánh giá + phân bố sao + đánh giá của người gọi. */
  async list(
    documentId: string,
    userId: string,
    query: { page?: number; limit?: number } = {},
  ): Promise<PaginatedRatings> {
    await this.findApprovedDocument(documentId);

    const page = Math.max(1, Number(query.page) || DEFAULT_PAGE);
    const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(query.limit) || DEFAULT_PAGE_SIZE));

    const [total, items, groups, aggregate, myRating] = await this.prisma.$transaction([
      this.prisma.rating.count({ where: { documentId } }),
      this.prisma.rating.findMany({
        where: { documentId },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: RATING_SELECT,
      }),
      this.prisma.rating.groupBy({
        by: ['stars'],
        where: { documentId },
        _count: { _all: true },
      }),
      this.prisma.rating.aggregate({ where: { documentId }, _avg: { stars: true } }),
      this.prisma.rating.findUnique({
        where: { documentId_userId: { documentId, userId } },
        select: RATING_SELECT,
      }),
    ]);

    const distribution: RatingSummary['distribution'] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const group of groups) {
      distribution[group.stars as 1 | 2 | 3 | 4 | 5] = group._count._all;
    }

    return {
      items: items as RatingItem[],
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
      summary: {
        ratingAvg: roundAverage(aggregate._avg.stars),
        ratingCount: total,
        distribution,
      },
      myRating: (myRating as RatingItem | null) ?? null,
    };
  }

  /** Tạo hoặc cập nhật đánh giá của người gọi; trả về cache mới của tài liệu. */
  async upsert(
    documentId: string,
    userId: string,
    dto: UpsertRatingDto,
  ): Promise<UpsertRatingResult> {
    const document = await this.findApprovedDocument(documentId);

    if (document.authorId === userId) {
      throw new NotFoundException('Bạn không thể đánh giá tài liệu của chính mình');
    }

    const comment = dto.comment?.trim() ? dto.comment.trim() : null;
    const existing = await this.prisma.rating.findUnique({
      where: { documentId_userId: { documentId, userId } },
      select: { id: true },
    });

    const result = await this.prisma.$transaction(async (tx) => {
      const rating = await tx.rating.upsert({
        where: { documentId_userId: { documentId, userId } },
        create: { documentId, userId, stars: dto.stars, comment },
        update: { stars: dto.stars, comment },
        select: RATING_SELECT,
      });

      const aggregate = await tx.rating.aggregate({
        where: { documentId },
        _avg: { stars: true },
        _count: { _all: true },
      });

      const ratingAvg = roundAverage(aggregate._avg.stars);
      const ratingCount = aggregate._count._all;

      await tx.document.update({
        where: { id: documentId },
        data: { ratingAvg, ratingCount },
      });

      return { rating: rating as RatingItem, ratingAvg, ratingCount };
    });

    // Chỉ đánh giá mới cộng EXP; sửa lại đánh giá cũ không cộng thêm để tránh farm.
    if (!existing) {
      await this.gamification.award({
        userId: document.authorId,
        delta: EXP_RULES.RATING,
        reason: ExpReason.RATING,
        refId: result.rating.id,
      });
    }

    return result;
  }

  /** Chỉ tài liệu đã duyệt, chưa xoá mới được xem / nhận đánh giá. */
  private async findApprovedDocument(
    documentId: string,
  ): Promise<{ id: string; authorId: string }> {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, status: DocumentStatus.APPROVED, deletedAt: null },
      select: { id: true, authorId: true },
    });

    if (!document) {
      throw new NotFoundException('Không tìm thấy tài liệu');
    }

    return document;
  }
}

/** Làm tròn 2 chữ số để hiển thị ổn định (vd 4.33 thay vì 4.3333333333). */
function roundAverage(value: number | null): number {
  return Math.round((value ?? 0) * 100) / 100;
}
