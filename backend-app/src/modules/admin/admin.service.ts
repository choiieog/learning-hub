import { Injectable } from '@nestjs/common';
import { TRANSACTION_OPTIONS } from '../../common/constants/transaction.constants';
import { DocumentStatus } from '../../common/enums/document-status.enum';
import { cutoffBefore } from '../../common/utils/retention.util';
import { PrismaService } from '../../infra/prisma/prisma.service';

const TOP_DOCUMENTS_LIMIT = 5;
const ACTIVITY_LIMIT = 10;
const ACTIVITY_DOCUMENTS = 6;
const ACTIVITY_WARNINGS = 4;

const STATUS_LABEL: Record<DocumentStatus, string> = {
  PENDING: 'chờ duyệt',
  APPROVED: 'đã duyệt',
};

interface AdminOverviewCounts {
  usersTotal: number;
  usersNew: number;
  usersWarned: number;
  usersBanned: number;
  documentsTotal: number;
  documentsPending: number;
  documentsApproved: number;
  totalViews: number;
  viewsIn7Days: number;
}

export interface AdminOverview {
  users: { total: number; newIn7Days: number; warned: number; banned: number };
  documents: { total: number; pending: number; approved: number };
  views: { total: number; in7Days: number };
  topDocuments: {
    id: string;
    title: string;
    viewCount: number;
    subject: { code: string; name: string };
    author: { fullName: string };
  }[];
  recentActivity: {
    id: string;
    type: 'DOCUMENT' | 'WARNING';
    message: string;
    createdAt: Date;
  }[];
}

/**
 * Số liệu cho trang tổng quan admin.
 *
 * Một transaction chỉ-đọc: đếm user (tổng, mới 7 ngày, bị cảnh báo, bị khoá),
 * đếm tài liệu theo trạng thái, tổng lượt xem + lượt xem 7 ngày, top 5 tài liệu
 * nhiều view và 10 hoạt động gần đây (bài đăng mới + cảnh báo tài khoản).
 */
@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(): Promise<AdminOverview> {
    const since7Days = cutoffBefore(7);

    // Một câu SQL gộp toàn bộ số đếm (9 chỉ số) thay cho 8 truy vấn rời. Transaction
    // giữ 4 truy vấn trên cùng một connection, tránh lỗi giao thức của Prisma Dev.
    const [countRows, topDocuments, recentDocuments, recentWarnings] =
      await this.prisma.$transaction([
        this.prisma.$queryRaw<AdminOverviewCounts[]>`
          WITH user_counts AS (
            SELECT
              count(*)::int AS "usersTotal",
              (count(*) FILTER (WHERE "createdAt" >= ${since7Days}))::int AS "usersNew",
              (count(*) FILTER (WHERE "warningCount" > 0))::int AS "usersWarned",
              (count(*) FILTER (WHERE status = 'BANNED'))::int AS "usersBanned"
            FROM "User"
            WHERE "deletedAt" IS NULL
          ),
          document_counts AS (
            SELECT
              count(*)::int AS "documentsTotal",
              (count(*) FILTER (WHERE status = 'PENDING'))::int AS "documentsPending",
              (count(*) FILTER (WHERE status = 'APPROVED'))::int AS "documentsApproved",
              coalesce(sum("viewCount"), 0)::int AS "totalViews"
            FROM "Document"
          ),
          view_counts AS (
            SELECT count(*)::int AS "viewsIn7Days"
            FROM "DocumentView"
            WHERE "createdAt" >= ${since7Days}
          )
          SELECT *
          FROM user_counts
          CROSS JOIN document_counts
          CROSS JOIN view_counts
        `,
        this.prisma.document.findMany({
          where: { status: DocumentStatus.APPROVED },
          orderBy: [{ viewCount: 'desc' }, { publishedAt: 'desc' }],
          take: TOP_DOCUMENTS_LIMIT,
          select: {
            id: true,
            title: true,
            viewCount: true,
            subject: { select: { code: true, name: true } },
            author: { select: { fullName: true } },
          },
        }),
        this.prisma.document.findMany({
          orderBy: { createdAt: 'desc' },
          take: ACTIVITY_DOCUMENTS,
          select: {
            id: true,
            title: true,
            status: true,
            createdAt: true,
            author: { select: { fullName: true } },
          },
        }),
        this.prisma.userWarning.findMany({
          orderBy: { createdAt: 'desc' },
          take: ACTIVITY_WARNINGS,
          select: {
            id: true,
            reason: true,
            createdAt: true,
            user: { select: { fullName: true } },
            admin: { select: { fullName: true } },
          },
        }),
      ], TRANSACTION_OPTIONS);

    const [counts] = countRows;

    const recentActivity: AdminOverview['recentActivity'] = [
      ...recentDocuments.map((document) => ({
        id: `document-${document.id}`,
        type: 'DOCUMENT' as const,
        message: `${document.author.fullName} đăng “${document.title}” (${STATUS_LABEL[document.status]})`,
        createdAt: document.createdAt,
      })),
      ...recentWarnings.map((warning) => ({
        id: `warning-${warning.id}`,
        type: 'WARNING' as const,
        message: `${warning.admin.fullName} cảnh báo ${warning.user.fullName}: ${warning.reason}`,
        createdAt: warning.createdAt,
      })),
    ]
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .slice(0, ACTIVITY_LIMIT);

    return {
      users: {
        total: counts.usersTotal,
        newIn7Days: counts.usersNew,
        warned: counts.usersWarned,
        banned: counts.usersBanned,
      },
      documents: {
        total: counts.documentsTotal,
        pending: counts.documentsPending,
        approved: counts.documentsApproved,
      },
      views: {
        total: counts.totalViews,
        in7Days: counts.viewsIn7Days,
      },
      topDocuments,
      recentActivity,
    };
  }
}
