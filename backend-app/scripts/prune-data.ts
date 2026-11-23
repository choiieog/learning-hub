import '../src/config/load-env';
import { retentionDays } from '../src/config/retention';
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

  const viewDays = retentionDays(process.env.DOCUMENT_VIEW_RETENTION_DAYS, 180);
  const readDays = retentionDays(
    process.env.NOTIFICATION_READ_RETENTION_DAYS,
    180,
  );
  const expDays = retentionDays(process.env.EXP_LOG_RETENTION_DAYS, 180);
  const personalDays = retentionDays(
    process.env.PERSONAL_NOTIFICATION_RETENTION_DAYS,
    180,
  );

  const pruned = await pruneRetentionData(prisma, {
    documentViewDays: viewDays,
    notificationReadDays: readDays,
    personalNotificationDays: personalDays,
    expLogDays: expDays,
  });

  console.log(
    `DocumentView: xoá ${pruned.documentViews.deleted} dòng cũ hơn ${viewDays} ngày ` +
      `(trước ${pruned.documentViews.cutoff.toISOString()}).`,
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
      `${pruned.broadcasts.deleted} thông báo chung cũ hơn ${readDays} ngày ` +
      `(trước ${pruned.broadcasts.cutoff.toISOString()}).`,
  );

  console.log(
    `ExpLog: xoá ${pruned.expLogs.deleted} dòng cũ hơn ${expDays} ngày ` +
      `(trước ${pruned.expLogs.cutoff.toISOString()}).`,
  );

  console.log(
    `Notification: xoá ${pruned.personalNotifications.deleted} thông báo cá nhân đã đọc ` +
      `cũ hơn ${personalDays} ngày (trước ${pruned.personalNotifications.cutoff.toISOString()}).`,
  );

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
