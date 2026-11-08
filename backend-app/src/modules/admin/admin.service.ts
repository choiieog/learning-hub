import { Injectable } from '@nestjs/common';
import { DocumentStatus } from '../../common/enums/document-status.enum';
import { PrismaService } from '../../infra/prisma/prisma.service';

const DAY_MS = 24 * 60 * 60 * 1000;
const TOP_DOCUMENTS_LIMIT = 5;
const ACTIVITY_LIMIT = 10;
const ACTIVITY_DOCUMENTS = 6;
const ACTIVITY_WARNINGS = 4;

const STATUS_LABEL: Record<DocumentStatus, string> = {
  PENDING: 'chờ duyệt',
  APPROVED: 'đã duyệt',
  REJECTED: 'bị từ chối',
};

export interface AdminOverview {
  users: { total: number; newIn7Days: number; warned: number; banned: number };
  documents: { total: number; pending: number; approved: number; rejected: number };
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
 * Một lượt Promise.all: đếm user (tổng, mới 7 ngày, bị cảnh báo, bị khoá),
 * đếm tài liệu theo trạng thái, tổng lượt xem + lượt xem 7 ngày, top 5 tài liệu
 * nhiều view và 10 hoạt động gần đây (bài đăng mới + cảnh báo tài khoản).
 */
@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(): Promise<AdminOverview> {
    const since7Days = new Date(Date.now() - 7 * DAY_MS);
    const activeDocuments = { deletedAt: null } as const;

    const [
      usersTotal,
      usersNew,
      usersWarned,
      usersBanned,
      documentsTotal,
      documentsPending,
      documentsApproved,
      documentsRejected,
      viewsAggregate,
      viewsIn7Days,
      topDocuments,
      recentDocuments,
      recentWarnings,
    ] = await Promise.all([
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.user.count({ where: { deletedAt: null, createdAt: { gte: since7Days } } }),
      this.prisma.user.count({ where: { deletedAt: null, warningCount: { gt: 0 } } }),
      this.prisma.user.count({ where: { deletedAt: null, status: 'BANNED' } }),
      this.prisma.document.count({ where: activeDocuments }),
      this.prisma.document.count({
        where: { ...activeDocuments, status: DocumentStatus.PENDING },
      }),
      this.prisma.document.count({
        where: { ...activeDocuments, status: DocumentStatus.APPROVED },
      }),
      this.prisma.document.count({
        where: { ...activeDocuments, status: DocumentStatus.REJECTED },
      }),
      this.prisma.document.aggregate({ where: activeDocuments, _sum: { viewCount: true } }),
      this.prisma.documentView.count({ where: { createdAt: { gte: since7Days } } }),
      this.prisma.document.findMany({
        where: { ...activeDocuments, status: DocumentStatus.APPROVED },
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
        where: activeDocuments,
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
    ]);

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
        total: usersTotal,
        newIn7Days: usersNew,
        warned: usersWarned,
        banned: usersBanned,
      },
      documents: {
        total: documentsTotal,
        pending: documentsPending,
        approved: documentsApproved,
        rejected: documentsRejected,
      },
      views: {
        total: viewsAggregate._sum.viewCount ?? 0,
        in7Days: viewsIn7Days,
      },
      topDocuments,
      recentActivity,
    };
  }
}
