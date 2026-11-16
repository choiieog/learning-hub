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
  /** Tổng chưa đọc (tin cá nhân + tin chung chưa đọc bởi chính người gọi). */
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
 * `userId = null` là thông báo chung (broadcast): mọi người thấy cùng một row, nên
 * trạng thái đã đọc không thể nằm ở `Notification.readAt` — nó sẽ đánh dấu đọc cho
 * tất cả mọi người. Vì vậy tin chung dùng bảng `NotificationRead(userId,
 * notificationId)`: mỗi người có trạng thái đọc riêng, mở tin hay "đọc tất cả" đều
 * ghi vào bảng này.
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Tác giả nhận tin bài đã duyệt và đang hiển thị công khai.
   * `tx` cho phép chạy trong transaction của `DocumentsService.approve()`: thông báo
   * và đổi trạng thái bài cùng commit hoặc cùng rollback.
   */
  async notifyApproved(
    document: ReviewedDocument,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    await (tx ?? this.prisma).notification.create({
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
  async notifyRejected(
    document: ReviewedDocument,
    reason: string | null,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const trimmed = reason?.trim();
    const suffix = trimmed ? ` Lý do: ${trimmed}` : '';

    await (tx ?? this.prisma).notification.create({
      data: {
        type: NotificationType.DOCUMENT_REJECTED,
        title: 'Tài liệu bị từ chối',
        message: `“${document.title}” chưa được duyệt.${suffix}`,
        link: `/documents/${document.id}`,
        userId: document.authorId,
      },
    });
  }

  /** Tác giả nhận tin bài bị admin xoá vì vi phạm; bài đã biến mất nên không kèm link. */
  async notifyDeleted(
    document: ReviewedDocument,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    await (tx ?? this.prisma).notification.create({
      data: {
        type: NotificationType.DOCUMENT_DELETED,
        title: 'Tài liệu đã bị xoá',
        message: `“${document.title}” đã bị quản trị viên xoá vì vi phạm quy định chia sẻ tài liệu.`,
        link: null,
        userId: document.authorId,
      },
    });
  }

  /**
   * Admin gửi thông báo hàng loạt: một row `userId = null` là đủ — mọi người thấy cùng một tin,
   * trạng thái đọc riêng nằm ở `NotificationRead`.
   */
  async broadcast(input: { title: string; message: string }): Promise<NotificationSummary> {
    const created = await this.prisma.notification.create({
      data: {
        type: NotificationType.SYSTEM,
        title: input.title.trim(),
        message: input.message.trim(),
        link: null,
        userId: null,
      },
      select: NOTIFICATION_SELECT,
    });

    return created as NotificationSummary;
  }

  /** Thông báo của tôi + thông báo chung; mới nhất trước. */
  async findMine(
    userId: string,
    query: ListNotificationsQueryDto,
  ): Promise<PaginatedNotifications> {
    const page = Math.max(1, Number(query.page) || DEFAULT_PAGE);
    const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(query.limit) || DEFAULT_PAGE_SIZE));

    const visible: Prisma.NotificationWhereInput = { OR: [{ userId }, { userId: null }] };
    // Tin cá nhân chưa đọc dùng readAt; tin chung chưa đọc = chưa có NotificationRead của user.
    const unread: Prisma.NotificationWhereInput = {
      OR: [
        { userId, readAt: null },
        { userId: null, reads: { none: { userId } } },
      ],
    };
    const where: Prisma.NotificationWhereInput = query.unreadOnly
      ? { AND: [visible, unread] }
      : visible;

    const [total, rows, personalUnread, broadcastUnread] = await this.prisma.$transaction([
      this.prisma.notification.count({ where }),
      this.prisma.notification.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          ...NOTIFICATION_SELECT,
          reads: { where: { userId }, select: { readAt: true } },
        },
      }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
      this.prisma.notification.count({ where: { userId: null, reads: { none: { userId } } } }),
    ]);

    const items: NotificationSummary[] = rows.map(({ reads, ...row }) => ({
      ...row,
      readAt: row.readAt ?? reads[0]?.readAt ?? null,
    }));

    return {
      items,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
      unreadCount: personalUnread + broadcastUnread,
    };
  }

  /**
   * Đánh dấu đã đọc một thông báo: tin cá nhân ghi `readAt`, tin chung ghi
   * `NotificationRead` của riêng người gọi.
   */
  async markRead(id: string, userId: string): Promise<{ id: string; readAt: Date }> {
    const notification = await this.prisma.notification.findFirst({
      where: { id, OR: [{ userId }, { userId: null }] },
      select: { id: true, userId: true, readAt: true },
    });

    if (!notification) {
      throw new NotFoundException('Không tìm thấy thông báo');
    }

    if (notification.userId === null) {
      const created = await this.prisma.notificationRead.upsert({
        where: { userId_notificationId: { userId, notificationId: id } },
        update: {},
        create: { userId, notificationId: id },
        select: { readAt: true },
      });

      return { id, readAt: created.readAt };
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

  /** Đọc tất cả: tin cá nhân + mọi tin chung chưa đọc của người gọi. */
  async markAllRead(userId: string): Promise<{ updated: number }> {
    const [personal, broadcasts] = await this.prisma.$transaction([
      this.prisma.notification.updateMany({
        where: { userId, readAt: null },
        data: { readAt: new Date() },
      }),
      this.prisma.notification.findMany({
        where: { userId: null, reads: { none: { userId } } },
        select: { id: true },
      }),
    ]);

    if (broadcasts.length > 0) {
      await this.prisma.notificationRead.createMany({
        data: broadcasts.map((item) => ({ userId, notificationId: item.id })),
        skipDuplicates: true,
      });
    }

    return { updated: personal.count + broadcasts.length };
  }
}
