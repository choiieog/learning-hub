import '../src/config/load-env';
import {
  retentionDays,
  retentionWindowsFromEnv,
} from '../src/config/retention';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { createStorageDriver } from '../src/infra/storage/storage.module';
import { StorageService } from '../src/infra/storage/storage.service';
import { pruneRetentionData } from '../src/modules/maintenance/prune-retention';
import { removeOrphanUploads } from '../src/modules/uploads/orphan-uploads';

/**
 * Dọn dữ liệu phình theo thời gian. Chạy hằng ngày bằng cron:
 *   0 2 * * *  cd /app/backend && npm run db:prune
 *
 * Script chỉ đọc env, gọi phần việc và in log. Chính sách của từng bảng (vì sao xoá cái gì,
 * vì sao giữ cái gì) nằm cạnh câu query: `pruneRetentionData` và `removeOrphanUploads`.
 */
async function main(): Promise<void> {
  const prisma = new PrismaService();
  await prisma.$connect();

  const windows = retentionWindowsFromEnv();
  const pruned = await pruneRetentionData(prisma, windows);

  console.log(
    `DocumentView: xoá ${pruned.documentViews.deleted} dòng cũ hơn ` +
      `${windows.documentViewDays} ngày (trước ${pruned.documentViews.cutoff.toISOString()}).`,
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

  console.log(
    `NotificationRead: xoá ${pruned.broadcasts.reads} trạng thái đọc của ` +
      `${pruned.broadcasts.deleted} thông báo chung cũ hơn ` +
      `${windows.notificationReadDays} ngày ` +
      `(trước ${pruned.broadcasts.cutoff.toISOString()}).`,
  );

  console.log(
    `ExpLog: xoá ${pruned.expLogs.deleted} dòng cũ hơn ` +
      `${windows.expLogDays} ngày ` +
      `(trước ${pruned.expLogs.cutoff.toISOString()}).`,
  );

  console.log(
    `Notification: xoá ${pruned.personalNotifications.deleted} thông báo cá nhân đã đọc ` +
      `cũ hơn ${windows.personalNotificationDays} ngày ` +
      `(trước ${pruned.personalNotifications.cutoff.toISOString()}).`,
  );

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
