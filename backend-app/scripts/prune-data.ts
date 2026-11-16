import '../src/config/load-env';
import { UPLOAD_URL_PREFIX } from '../src/common/constants/upload.constants';
import { Prisma } from '../src/generated/prisma/client';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { createStorageDriver } from '../src/infra/storage/storage.module';
import { StorageService } from '../src/infra/storage/storage.service';

/**
 * Dọn dữ liệu phình theo thời gian. Chạy hằng ngày bằng cron:
 *   0 2 * * *  cd /app/backend && npm run db:prune
 *
 * 1. `DocumentView` cũ hơn `DOCUMENT_VIEW_RETENTION_DAYS` (mặc định 180). An toàn với
 *    chống spam vì `dayKey` luôn là hôm nay; `Document.viewCount` là tổng luỹ kế nên
 *    số hiển thị không đổi.
 * 2. `UploadedFile` mồ côi (upload rồi bỏ, avatar đã bị thay) cũ hơn
 *    `UPLOAD_ORPHAN_RETENTION_DAYS` (mặc định 7): xoá row DB rồi mới xoá file, để lỗi
 *    storage không bao giờ làm mất dấu một file còn trên đĩa.
 *    Avatar **đang dùng** cũng có `documentId = null` nên phải loại theo `User.avatarUrl`.
 * 3. Trạng thái đọc của thông báo chung: mỗi broadcast × mỗi user = 1 row
 *    `NotificationRead`. Xoá read row của broadcast cũ hơn
 *    `NOTIFICATION_READ_RETENTION_DAYS` (mặc định 180) **cùng với broadcast đó**: xoá
 *    read row mà giữ thông báo sẽ làm badge "chưa đọc" hiện lại với tin từ nửa năm trước.
 *    Thông báo cá nhân (duyệt/từ chối/bị xoá/cảnh báo) không bị đụng tới.
 */
const DAY_MS = 24 * 60 * 60 * 1000;

/** Số ngày từ env; thiếu hoặc không hợp lệ thì dùng mặc định. */
function retentionDays(value: string | undefined, fallback: number): number {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function cutoffBefore(days: number): Date {
  return new Date(Date.now() - days * DAY_MS);
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
  const uploadCutoff = cutoffBefore(uploadDays);
  const avatarOwners = await prisma.user.findMany({
    where: { avatarUrl: { startsWith: `${UPLOAD_URL_PREFIX}/` } },
    select: { avatarUrl: true },
  });
  const avatarUrls = avatarOwners.flatMap((user) =>
    user.avatarUrl ? [user.avatarUrl] : [],
  );

  const orphans = await prisma.uploadedFile.findMany({
    where: {
      documentId: null,
      createdAt: { lt: uploadCutoff },
      // Avatar đang dùng cũng `documentId = null` → không được xoá.
      url: { notIn: avatarUrls },
    },
    select: { publicId: true },
  });

  const removedFiles: string[] = [];

  for (const { publicId } of orphans) {
    try {
      // Xoá từng row thay vì `deleteMany` để biết chắc row nào đã mất — chỉ khi đó mới
      // xoá file trên đĩa. Filter `documentId: null` giữ an toàn nếu file vừa được gắn
      // vào một tài liệu giữa lúc quét và lúc xoá (Prisma báo P2025, ta bỏ qua).
      await prisma.uploadedFile.delete({
        where: { publicId, documentId: null },
      });
      removedFiles.push(publicId);
    } catch {
      console.warn(
        `UploadedFile ${publicId}: vừa được dùng cho tài liệu, để lần chạy sau.`,
      );
    }
  }

  if (removedFiles.length > 0) {
    await new StorageService(createStorageDriver()).removeMany(removedFiles);
  }

  console.log(
    `UploadedFile: xoá ${removedFiles.length}/${orphans.length} file mồ côi cũ hơn ${uploadDays} ngày ` +
      `(trước ${uploadCutoff.toISOString()}).`,
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

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
