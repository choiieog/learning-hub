import { cutoffBefore } from '../../common/utils/retention.util';
import { Prisma } from '../../generated/prisma/client';
import type { PrismaService } from '../../infra/prisma/prisma.service';

/**
 * Chỉ cần bốn delegate này, nhờ vậy test truyền được Prisma thật (hoặc mock) mà không
 * phải dựng cả `PrismaService`.
 */
type RetentionPrisma = Pick<
  PrismaService,
  'documentView' | 'notificationRead' | 'notification' | 'expLog'
>;

export interface RetentionWindows {
  /** `DOCUMENT_VIEW_RETENTION_DAYS`. */
  documentViewDays: number;
  /** `NOTIFICATION_READ_RETENTION_DAYS`. */
  notificationReadDays: number;
  /** `PERSONAL_NOTIFICATION_RETENTION_DAYS`. */
  personalNotificationDays: number;
  /** `EXP_LOG_RETENTION_DAYS`. */
  expLogDays: number;
  /** Thời điểm "bây giờ" — tham số để test khoá được các mốc cutoff. */
  now?: Date;
}

export interface PruneRetentionResult {
  documentViews: { cutoff: Date; deleted: number };
  /** Thông báo chung (broadcast) cũ: xoá kèm mọi `NotificationRead` của nó. */
  broadcasts: { cutoff: Date; reads: number; deleted: number };
  personalNotifications: { cutoff: Date; deleted: number };
  expLogs: { cutoff: Date; deleted: number };
}

/**
 * Dọn các bảng phình theo thời gian trong `scripts/prune-data.ts` (trừ file mồ côi, nằm ở
 * `removeOrphanUploads`). Mọi mốc đều là "cũ hơn N ngày" và dùng chung `cutoffBefore`.
 *
 * - `DocumentView`: an toàn với chống spam vì `dayKey` luôn là hôm nay; `Document.viewCount`
 *   là tổng luỹ kế nên số hiển thị không đổi.
 * - Thông báo chung: xoá read row **cùng** broadcast. Xoá read row mà giữ thông báo sẽ làm
 *   badge "chưa đọc" hiện lại với tin từ nửa năm trước.
 * - Thông báo cá nhân: chỉ xoá tin **đã đọc**; tin chưa đọc thì giữ vì người dùng còn chưa xem.
 * - `ExpLog`: chỉ là sổ đối soát, điểm/level nằm ở `User.exp`/`User.level`.
 */
export async function pruneRetentionData(
  prisma: RetentionPrisma,
  windows: RetentionWindows,
): Promise<PruneRetentionResult> {
  const viewCutoff = cutoffBefore(windows.documentViewDays, windows.now);
  const documentViews = await prisma.documentView.deleteMany({
    where: { createdAt: { lt: viewCutoff } },
  });

  const readCutoff = cutoffBefore(windows.notificationReadDays, windows.now);
  const staleBroadcasts = {
    userId: null,
    createdAt: { lt: readCutoff },
  } satisfies Prisma.NotificationWhereInput;

  // Đếm read row trước: xoá thông báo sẽ cascade luôn các row đó.
  const reads = await prisma.notificationRead.count({
    where: { notification: staleBroadcasts },
  });
  const broadcasts = await prisma.notification.deleteMany({
    where: staleBroadcasts,
  });

  const expCutoff = cutoffBefore(windows.expLogDays, windows.now);
  const expLogs = await prisma.expLog.deleteMany({
    where: { createdAt: { lt: expCutoff } },
  });

  const personalCutoff = cutoffBefore(
    windows.personalNotificationDays,
    windows.now,
  );
  // `readAt` khác null ⇒ đã đọc; tin chưa đọc của người dùng thì giữ lại.
  const personalNotifications = await prisma.notification.deleteMany({
    where: { userId: { not: null }, readAt: { lt: personalCutoff } },
  });

  return {
    documentViews: { cutoff: viewCutoff, deleted: documentViews.count },
    broadcasts: { cutoff: readCutoff, reads, deleted: broadcasts.count },
    personalNotifications: {
      cutoff: personalCutoff,
      deleted: personalNotifications.count,
    },
    expLogs: { cutoff: expCutoff, deleted: expLogs.count },
  };
}
