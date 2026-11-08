import { Injectable } from '@nestjs/common';
import { DocumentStatus } from '../../common/enums/document-status.enum';
import { vietnamDayKey } from '../../common/utils/day-key.util';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';

const RECENT_LIMIT = 5;
const TOP_LIMIT = 5;
const TREND_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Thẻ tài liệu trên tổng quan — đủ để hiện tiêu đề, môn, trạng thái, lượt xem, file. */
const DASHBOARD_DOCUMENT_SELECT = {
  id: true,
  title: true,
  status: true,
  viewCount: true,
  createdAt: true,
  publishedAt: true,
  subject: { select: { id: true, code: true, name: true } },
  files: { select: { name: true, mimeType: true, size: true } },
} satisfies Prisma.DocumentSelect;

/** Tài liệu của tôi: thêm lý do từ chối để hiện ngay trên thẻ. */
const MY_DOCUMENT_CARD_SELECT = {
  ...DASHBOARD_DOCUMENT_SELECT,
  rejectReason: true,
} satisfies Prisma.DocumentSelect;

/** Top tài liệu: thêm tác giả vì đây là bài của người khác. */
const TOP_DOCUMENT_CARD_SELECT = {
  ...DASHBOARD_DOCUMENT_SELECT,
  author: { select: { id: true, fullName: true, avatarUrl: true } },
} satisfies Prisma.DocumentSelect;

export interface DashboardDocumentCard {
  id: string;
  title: string;
  status: DocumentStatus;
  viewCount: number;
  createdAt: Date;
  publishedAt: Date | null;
  rejectReason?: string | null;
  subject: { id: string; code: string; name: string };
  files: { name: string; mimeType: string; size: number }[];
  author?: { id: string; fullName: string; avatarUrl: string | null };
}

export interface DashboardOverview {
  stats: {
    totalDocuments: number;
    approved: number;
    pending: number;
    rejected: number;
    totalViews: number;
    viewsLast7Days: number;
  };
  /** Lượt xem tài liệu của tôi theo từng ngày (cũ → mới), dùng cho biểu đồ cột nhỏ. */
  viewTrend: { day: string; count: number }[];
  recentDocuments: DashboardDocumentCard[];
  topDocuments: DashboardDocumentCard[];
}

/**
 * Số liệu cho trang tổng quan sinh viên.
 *
 * Một request gom đủ dữ liệu (Promise.all) để trang chỉ cần gọi API một lần:
 * đếm tài liệu theo trạng thái, tổng lượt xem, lượt xem 7 ngày, 5 bài gần đây
 * của chính người dùng và 5 bài nhiều lượt xem nhất toàn hệ thống.
 */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(userId: string): Promise<DashboardOverview> {
    const mine: Prisma.DocumentWhereInput = { authorId: userId, deletedAt: null };
    const trendDays = buildTrendDays();
    const trendStart = new Date(Date.now() - (TREND_DAYS - 1) * DAY_MS);
    trendStart.setHours(0, 0, 0, 0);

    const [totalDocuments, approved, pending, rejected, viewsAgg, recentDocuments, topDocuments, trendRows] =
      await Promise.all([
        this.prisma.document.count({ where: mine }),
        this.prisma.document.count({ where: { ...mine, status: DocumentStatus.APPROVED } }),
        this.prisma.document.count({ where: { ...mine, status: DocumentStatus.PENDING } }),
        this.prisma.document.count({ where: { ...mine, status: DocumentStatus.REJECTED } }),
        this.prisma.document.aggregate({ where: mine, _sum: { viewCount: true } }),
        this.prisma.document.findMany({
          where: mine,
          orderBy: { createdAt: 'desc' },
          take: RECENT_LIMIT,
          select: MY_DOCUMENT_CARD_SELECT,
        }),
        this.prisma.document.findMany({
          where: { status: DocumentStatus.APPROVED, deletedAt: null },
          orderBy: [{ viewCount: 'desc' }, { publishedAt: 'desc' }],
          take: TOP_LIMIT,
          select: TOP_DOCUMENT_CARD_SELECT,
        }),
        this.prisma.documentView.groupBy({
          by: ['dayKey'],
          where: {
            dayKey: { in: trendDays },
            document: { authorId: userId },
            createdAt: { gte: trendStart },
          },
          _count: { _all: true },
        }),
      ]);

    const countByDay = new Map(trendRows.map((row) => [row.dayKey, row._count._all]));
    const viewTrend = trendDays.map((day) => ({ day, count: countByDay.get(day) ?? 0 }));

    return {
      stats: {
        totalDocuments,
        approved,
        pending,
        rejected,
        totalViews: viewsAgg._sum.viewCount ?? 0,
        viewsLast7Days: viewTrend.reduce((sum, point) => sum + point.count, 0),
      },
      viewTrend,
      recentDocuments: recentDocuments as DashboardDocumentCard[],
      topDocuments: topDocuments as DashboardDocumentCard[],
    };
  }
}

/** 7 ngày gần nhất theo giờ Việt Nam, cũ → mới. */
function buildTrendDays(): string[] {
  const now = Date.now();

  return Array.from({ length: TREND_DAYS }, (_, index) =>
    vietnamDayKey(new Date(now - (TREND_DAYS - 1 - index) * DAY_MS)),
  );
}
