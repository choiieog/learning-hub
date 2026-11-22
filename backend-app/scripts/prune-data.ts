import '../src/config/load-env';
import { cutoffBefore } from '../src/common/utils/retention.util';
import { Prisma } from '../src/generated/prisma/client';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { createStorageDriver } from '../src/infra/storage/storage.module';
import { StorageService } from '../src/infra/storage/storage.service';
import { removeOrphanUploads } from '../src/modules/uploads/orphan-uploads';

/**
 * Dọn dữ liệu phình theo thời gian. Chạy hằng ngày bằng cron:
 *   0 2 * * *  cd /app/backend && npm run db:prune
 *
 * 1. `DocumentView` cũ hơn `DOCUMENT_VIEW_RETENTION_DAYS` (mặc định 180). An toàn với
 *    chống spam vì `dayKey` luôn là hôm nay; `Document.viewCount` là tổng luỹ kế nên
 *    số hiển thị không đổi.
 * 2. `UploadedFile` mồ côi cũ hơn `UPLOAD_ORPHAN_RETENTION_DAYS` (mặc định 7) — cách chọn
 *    và thứ tự xoá nằm ở `removeOrphanUploads`.
 * 3. Trạng thái đọc của thông báo chung: mỗi broadcast × mỗi user = 1 row
 *    `NotificationRead`. Xoá read row của broadcast cũ hơn
 *    `NOTIFICATION_READ_RETENTION_DAYS` (mặc định 180) **cùng với broadcast đó**: xoá
 *    read row mà giữ thông báo sẽ làm badge "chưa đọc" hiện lại với tin từ nửa năm trước.
 *    Thông báo cá nhân (duyệt/từ chối/bị xoá/cảnh báo) không bị đụng tới.
 * 4. Thông báo **cá nhân đã đọc** cũ hơn `PERSONAL_NOTIFICATION_RETENTION_DAYS`
 *    (mặc định 180). Tin chưa đọc thì giữ: người dùng còn chưa xem, xoá là mất thông tin.
 * 5. `ExpLog` cũ hơn `EXP_LOG_RETENTION_DAYS` (mặc định 180). Đây chỉ là sổ đối soát:
 *    điểm/level nằm ở `User.exp`/`User.level` nên xoá log không làm sai số của ai.
 */
/** Số ngày từ env; thiếu hoặc không hợp lệ thì dùng mặc định. */
function retentionDays(value: string | undefined, fallback: number): number {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function main(): Promise<void> {
  const prisma = new PrismaService();
  await prisma.$connect();

  const viewDays = retentionDays(process.env.DOCUMENT_VIEW_RETENTION_DAYS, 180);
  const viewCutoff = cutoffBefore(viewDays);
  const views = await prisma.documentView.deleteMany({
    where: { createdAt: { lt: viewCutoff } },
  });

  console.log(
    `DocumentView: xoá ${views.count} dòng cũ hơn ${viewDays} ngày (trước ${viewCutoff.toISOString()}).`,
  );

  const uploadDays = retentionDays(process.env.UPLOAD_ORPHAN_RETENTION_DAYS, 7);
  const orphanUploads = await removeOrphanUploads(
    prisma,
    new StorageService(createStorageDriver()),
    { retentionDays: uploadDays, log: console.warn },
  );

  console.log(
    `UploadedFile: xoá ${orphanUploads.removed.length}/${orphanUploads.scanned} file mồ côi cũ hơn ` +
      `${uploadDays} ngày (trước ${orphanUploads.cutoff.toISOString()}).`,
  );

  const readDays = retentionDays(
    process.env.NOTIFICATION_READ_RETENTION_DAYS,
    180,
  );
  const readCutoff = cutoffBefore(readDays);
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

  console.log(
    `NotificationRead: xoá ${reads} trạng thái đọc của ${broadcasts.count} thông báo chung ` +
      `cũ hơn ${readDays} ngày (trước ${readCutoff.toISOString()}).`,
  );

  const expDays = retentionDays(process.env.EXP_LOG_RETENTION_DAYS, 180);
  const expCutoff = cutoffBefore(expDays);
  const expLogs = await prisma.expLog.deleteMany({
    where: { createdAt: { lt: expCutoff } },
  });

  console.log(
    `ExpLog: xoá ${expLogs.count} dòng cũ hơn ${expDays} ngày (trước ${expCutoff.toISOString()}).`,
  );

  const personalDays = retentionDays(
    process.env.PERSONAL_NOTIFICATION_RETENTION_DAYS,
    180,
  );
  const personalCutoff = cutoffBefore(personalDays);
  // `readAt` khác null ⇒ đã đọc; tin chưa đọc của người dùng thì giữ lại.
  const personal = await prisma.notification.deleteMany({
    where: { userId: { not: null }, readAt: { lt: personalCutoff } },
  });

  console.log(
    `Notification: xoá ${personal.count} thông báo cá nhân đã đọc cũ hơn ${personalDays} ngày ` +
      `(trước ${personalCutoff.toISOString()}).`,
  );

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
