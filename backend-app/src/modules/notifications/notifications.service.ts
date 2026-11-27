import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { TRANSACTION_OPTIONS } from '../../common/constants/transaction.constants';
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
  // `null` = thông báo chung; client cần biết để đổi nhãn xoá thành "ẩn".
  userId: true,
  readAt: true,
  createdAt: true,
} satisfies Prisma.NotificationSelect;

export interface NotificationSummary {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  /** `null` = thông báo chung (mọi người thấy cùng một row). */
  userId: string | null;
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
        userId: document.authorId,
      },
    });
  }

  /** Tác giả biết bài bị từ chối kèm lý do; bài đã bị xoá nên thông báo không kèm link. */
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
        message: `“${document.title}” đã bị từ chối và xoá khỏi hệ thống.${suffix}`,
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

    const visible: Prisma.NotificationWhereInput = {
      OR: [
        { userId },
        // Tin chung mà chính người gọi đã ẩn thì không trả về nữa; người khác vẫn thấy.
        { userId: null, reads: { none: { userId, deletedAt: { not: null } } } },
      ],
    };
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
    ], TRANSACTION_OPTIONS);

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
    ], TRANSACTION_OPTIONS);

    if (broadcasts.length > 0) {
      await this.prisma.notificationRead.createMany({
        data: broadcasts.map((item) => ({ userId, notificationId: item.id })),
        skipDuplicates: true,
      });
    }

    return { updated: personal.count + broadcasts.length };
  }

  /**
   * Người dùng xoá thông báo khỏi danh sách của mình:
   * - tin cá nhân: xoá cứng row (chỉ chủ tin mới được xoá);
   * - tin chung: chỉ ẩn với riêng người gọi (`NotificationRead.deletedAt`), người khác
   *   vẫn thấy. Chỉ khi admin thu hồi (`deleteBroadcast`) thì tin mới mất với tất cả.
   */
  async deleteOwn(id: string, userId: string): Promise<{ id: string }> {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });

    if (!notification) {
      throw new NotFoundException('Không tìm thấy thông báo');
    }

    if (notification.userId === null) {
      await this.prisma.notificationRead.upsert({
        where: { userId_notificationId: { userId, notificationId: id } },
        update: { deletedAt: new Date() },
        create: { userId, notificationId: id, deletedAt: new Date() },
      });

      return { id };
    }

    if (notification.userId !== userId) {
      throw new ForbiddenException('Bạn chỉ có thể xoá thông báo của mình.');
    }

    await this.prisma.notification.delete({ where: { id } });

    return { id };
  }

  /**
   * Xoá tất cả thông báo khỏi danh sách của người gọi: tin cá nhân bị xoá hẳn, tin
   * chung chỉ bị ẩn với riêng người này (`NotificationRead.deletedAt`) như khi xoá lẻ.
   */
  async deleteAll(userId: string): Promise<{ deleted: number }> {
    const [personal, broadcasts, reads] = await this.prisma.$transaction([
      this.prisma.notification.deleteMany({ where: { userId } }),
      this.prisma.notification.findMany({ where: { userId: null }, select: { id: true } }),
      this.prisma.notificationRead.findMany({
        where: { userId },
        select: { notificationId: true },
      }),
    ], TRANSACTION_OPTIONS);

    const now = new Date();
    const hidden = new Set(reads.map((row) => row.notificationId));
    const missing = broadcasts.filter((item) => !hidden.has(item.id));

    await this.prisma.$transaction([
      this.prisma.notificationRead.updateMany({
        where: { userId },
        data: { deletedAt: now },
      }),
      ...(missing.length > 0
        ? [
            this.prisma.notificationRead.createMany({
              data: missing.map((item) => ({
                userId,
                notificationId: item.id,
                deletedAt: now,
              })),
              skipDuplicates: true,
            }),
          ]
        : []),
    ], TRANSACTION_OPTIONS);

    return { deleted: personal.count + broadcasts.length };
  }

  /**
   * Admin thu hồi thông báo chung: xoá row dùng chung, `NotificationRead` của mọi người
   * bị xoá theo cascade nên tin biến mất khỏi tất cả chuông.
   */
  async deleteBroadcast(id: string): Promise<{ id: string }> {
    const notification = await this.prisma.notification.findFirst({
      where: { id, userId: null },
      select: { id: true },
    });

    if (!notification) {
      throw new NotFoundException('Không tìm thấy thông báo chung');
    }

    await this.prisma.notification.delete({ where: { id } });

    return { id };
  }

  /** Thông báo chung admin đã gửi, mới nhất trước — để xem lại và thu hồi. */
  async findBroadcasts(
    query: ListNotificationsQueryDto,
  ): Promise<Omit<PaginatedNotifications, 'unreadCount'>> {
    const page = Math.max(1, Number(query.page) || DEFAULT_PAGE);
    const limit = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Number(query.limit) || DEFAULT_PAGE_SIZE),
    );
    const where: Prisma.NotificationWhereInput = { userId: null };

    const [total, items] = await this.prisma.$transaction([
      this.prisma.notification.count({ where }),
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: NOTIFICATION_SELECT,
      }),
    ], TRANSACTION_OPTIONS);

    return {
      items,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }
}
