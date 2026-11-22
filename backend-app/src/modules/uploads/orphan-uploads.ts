import { cutoffBefore } from '../../common/utils/retention.util';
import { UPLOAD_URL_PREFIX } from '../../common/constants/upload.constants';
import type { PrismaService } from '../../infra/prisma/prisma.service';
import type { StorageService } from '../../infra/storage/storage.service';

/** Chỉ cần đúng hai delegate này, nhờ vậy test truyền được mock thay vì Prisma thật. */
type OrphanPrisma = Pick<PrismaService, 'user' | 'uploadedFile'>;
type OrphanStorage = Pick<StorageService, 'removeMany'>;

export interface OrphanUploadsOptions {
  /** File chưa gắn tài liệu phải cũ hơn ngần này ngày mới bị xoá. */
  retentionDays: number;
  /** Thời điểm "bây giờ" — tham số để test khoá được mốc cutoff. */
  now?: Date;
  log?: (message: string) => void;
}

export interface OrphanUploadsResult {
  cutoff: Date;
  /** Số file mồ côi tìm thấy. */
  scanned: number;
  /** publicId của những file đã xoá cả row DB lẫn file. */
  removed: string[];
}

/**
 * Dọn `UploadedFile` mồ côi: upload rồi bỏ, hoặc avatar đã bị thay.
 *
 * - Avatar **đang dùng** cũng có `documentId = null`, nên phải loại theo `User.avatarUrl`,
 *   nếu không lần chạy nào cũng xoá mất ảnh đại diện.
 * - Xoá row DB trước rồi mới xoá file: lỗi storage không bao giờ làm mất dấu một file
 *   còn trên đĩa.
 * - Xoá từng row (không `deleteMany`) để biết chắc row nào đã mất; filter `documentId: null`
 *   giữ an toàn nếu file vừa được gắn vào tài liệu giữa lúc quét và lúc xoá (Prisma P2025).
 */
export async function removeOrphanUploads(
  prisma: OrphanPrisma,
  storage: OrphanStorage,
  options: OrphanUploadsOptions,
): Promise<OrphanUploadsResult> {
  const cutoff = cutoffBefore(options.retentionDays, options.now);

  const avatarOwners = await prisma.user.findMany({
    where: { avatarUrl: { startsWith: `${UPLOAD_URL_PREFIX}/` } },
    select: { avatarUrl: true },
  });
  const avatarUrls = avatarOwners.flatMap((owner) =>
    owner.avatarUrl ? [owner.avatarUrl] : [],
  );

  const orphans = await prisma.uploadedFile.findMany({
    where: {
      documentId: null,
      createdAt: { lt: cutoff },
      url: { notIn: avatarUrls },
    },
    select: { publicId: true },
  });

  const removed: string[] = [];

  for (const { publicId } of orphans) {
    try {
      await prisma.uploadedFile.delete({ where: { publicId, documentId: null } });
      removed.push(publicId);
    } catch {
      options.log?.(`UploadedFile ${publicId}: vừa được dùng cho tài liệu, để lần chạy sau.`);
    }
  }

  if (removed.length > 0) {
    await storage.removeMany(removed);
  }

  return { cutoff, scanned: orphans.length, removed };
}
