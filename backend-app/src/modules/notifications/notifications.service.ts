import { Injectable, NotFoundException } from '@nestjs/common';
import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from '../../common/dto/pagination-query.dto';
import { NotificationType, Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';

const NOTIFICATION_SELECT = {
  id: true,
  type: true,
  title: true,
  message: true,
  link: true,
  readAt: true,
  createdAt: true,
} satisfies Prisma.NotificationSelect;

export interface NotificationSummary {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  link: string | null;
  readAt: Date | null;
  createdAt: Date;
}

export interface PaginatedNotifications {
  items: NotificationSummary[];
  meta: { page: number; limit: number; total: number; totalPages: number };
  /** Tổng chưa đọc (gồm cả thông báo chung) để hiện badge trên chuông. */
  unreadCount: number;
}

/** Tài liệu vừa được admin xử lý — đủ dữ liệu để dựng thông báo cho tác giả. */
export interface ReviewedDocument {
  id: string;
  title: string;
  authorId: string;
}

/**
 * Thông báo trong app (phase 2).
 *
 * Hiện tại: tạo thông báo khi admin duyệt / từ chối bài (kèm lý do) và API đọc
 * thông báo của chính người dùng. `userId = null` là thông báo chung (broadcast);
 * các thông báo đó không đánh dấu đọc riêng được nên markRead chỉ nhận thông báo cá nhân.
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Tác giả nhận tin bài đã duyệt và đang hiển thị công khai. */
  async notifyApproved(document: ReviewedDocument): Promise<void> {
    await this.prisma.notification.create({
      data: {
        type: NotificationType.DOCUMENT_APPROVED,
        title: 'Tài liệu đã được duyệt',
        message: `“${document.title}” đã được duyệt và hiển thị công khai với mọi sinh viên.`,
        link: `/documents/${document.id}`,
        userId: document.authorId,
      },
    });
  }

  /** Tác giả nhận tin bài bị từ chối kèm lý do để biết cần sửa gì. */
  async notifyRejected(document: ReviewedDocument, reason: string | null): Promise<void> {
    const trimmed = reason?.trim();
    const suffix = trimmed ? ` Lý do: ${trimmed}` : '';

    await this.prisma.notification.create({
      data: {
        type: NotificationType.DOCUMENT_REJECTED,
        title: 'Tài liệu bị từ chối',
        message: `“${document.title}” chưa được duyệt.${suffix}`,
        link: `/documents/${document.id}`,
        userId: document.authorId,
      },
    });
  }

  /** Thông báo của tôi + thông báo chung; mới nhất trước. */
  async findMine(
    userId: string,
    query: ListNotificationsQueryDto,
  ): Promise<PaginatedNotifications> {
    const page = Math.max(1, Number(query.page) || DEFAULT_PAGE);
    const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(query.limit) || DEFAULT_PAGE_SIZE));

    const where: Prisma.NotificationWhereInput = { OR: [{ userId }, { userId: null }] };
    if (query.unreadOnly) {
      where.readAt = null;
    }

    const [total, items, unreadCount] = await this.prisma.$transaction([
      this.prisma.notification.count({ where }),
      this.prisma.notification.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: NOTIFICATION_SELECT,
      }),
      this.prisma.notification.count({
        where: { OR: [{ userId }, { userId: null }], readAt: null },
      }),
    ]);

    return {
      items: items as NotificationSummary[],
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
      unreadCount,
    };
  }

  /** Đánh dấu đã đọc một thông báo của chính mình. */
  async markRead(id: string, userId: string): Promise<{ id: string; readAt: Date }> {
    const notification = await this.prisma.notification.findFirst({
      where: { id, userId },
      select: { id: true, readAt: true },
    });

    if (!notification) {
      throw new NotFoundException('Không tìm thấy thông báo');
    }

    if (notification.readAt) {
      return { id, readAt: notification.readAt };
    }

    const updated = await this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
      select: { id: true, readAt: true },
    });

    return { id: updated.id, readAt: updated.readAt ?? new Date() };
  }

  /** Đọc tất cả thông báo cá nhân chưa đọc. */
  async markAllRead(userId: string): Promise<{ updated: number }> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });

    return { updated: result.count };
  }
}
