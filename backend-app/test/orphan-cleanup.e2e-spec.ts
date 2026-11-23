import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { access, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { cutoffBefore } from '../src/common/utils/retention.util';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { createStorageDriver } from '../src/infra/storage/storage.module';
import { StorageService } from '../src/infra/storage/storage.service';
import { removeOrphanUploads } from '../src/modules/uploads/orphan-uploads';

/**
 * E2E thật cho đường chạy dọn file mồ côi (cron `db:prune`): Postgres thật + driver local
 * ghi/xoá file thật trong `UPLOAD_DIR` của e2e.
 *
 * Bốn loại file được seed cùng lúc để chứng minh câu query chọn đúng:
 * - mồ côi, cũ hơn retention → phải mất cả row lẫn file;
 * - avatar đang dùng (`documentId = null` nhưng có trong `User.avatarUrl`) → phải còn;
 * - file mới tạo hôm nay → phải còn;
 * - file đã gắn vào tài liệu nhưng cũ → phải còn.
 *
 * Mọi assertion chỉ nói về row/file của chính suite này (`publicId` có `suffix`), không so sánh
 * tổng số hay `removed` exact: DB e2e dùng chung có thể còn row mồ côi từ lần chạy trước, và
 * việc dọn chúng là hành vi đúng của cron.
 */
describe('Dọn file mồ côi (e2e)', () => {
  const suffix = Date.now();
  const uploadRoot = process.env.UPLOAD_DIR as string;
  const content = 'noi-dung-file';

  const orphanPublicId = `documents/e2e-orphan-${suffix}.pdf`;
  const avatarPublicId = `avatars/e2e-avatar-${suffix}.png`;
  const freshPublicId = `documents/e2e-fresh-${suffix}.pdf`;
  const linkedPublicId = `documents/e2e-linked-${suffix}.pdf`;
  const ghostPublicId = `documents/e2e-ghost-${suffix}.pdf`;

  const email = `e2e-orphan-${suffix}@example.com`;
  const subjectCode = `E2E-ORPHAN-${suffix}`;

  let prisma: PrismaService;
  let userId: string;
  let documentId: string;

  async function writeUpload(publicId: string): Promise<void> {
    const path = join(uploadRoot, publicId);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
  }

  async function exists(path: string): Promise<boolean> {
    return access(path).then(
      () => true,
      () => false,
    );
  }

  function fileRow(publicId: string, ownerId: string, createdAt: Date) {
    return {
      publicId,
      url: `/api/files/${publicId}`,
      name: publicId.split('/')[1],
      size: content.length,
      mimeType: 'application/pdf',
      folder: publicId.split('/')[0],
      ownerId,
      createdAt,
    };
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const old = cutoffBefore(30);
    const avatarUrl = `/api/files/${avatarPublicId}`;

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: 'x',
        fullName: 'E2E Dọn File',
        avatarUrl,
        emailVerifiedAt: new Date(),
      },
    });
    userId = user.id;

    const subject = await prisma.subject.create({
      data: { code: subjectCode, name: 'Môn cho dọn file' },
    });
    const document = await prisma.document.create({
      data: {
        title: 'Bài dùng file',
        subjectId: subject.id,
        authorId: user.id,
      },
    });
    documentId = document.id;

    await prisma.uploadedFile.createMany({
      data: [
        fileRow(orphanPublicId, user.id, old),
        fileRow(avatarPublicId, user.id, old),
        fileRow(freshPublicId, user.id, new Date()),
      ],
    });
    await prisma.uploadedFile.create({
      data: { ...fileRow(linkedPublicId, user.id, old), documentId },
    });

    for (const publicId of [
      orphanPublicId,
      avatarPublicId,
      freshPublicId,
      linkedPublicId,
    ]) {
      await writeUpload(publicId);
    }
  });

  afterAll(async () => {
    const publicIds = [
      orphanPublicId,
      avatarPublicId,
      freshPublicId,
      linkedPublicId,
      ghostPublicId,
    ];
    await prisma.uploadedFile.deleteMany({
      where: { publicId: { in: publicIds } },
    });
    await prisma.document.deleteMany({ where: { id: documentId } });
    await prisma.subject.deleteMany({ where: { code: subjectCode } });
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();

    await Promise.all(
      publicIds.map((publicId) =>
        rm(join(uploadRoot, publicId), { force: true }),
      ),
    );
  });

  it('xoá file mồ côi cũ, giữ avatar đang dùng, file mới và file đã gắn tài liệu', async () => {
    const result = await removeOrphanUploads(
      prisma,
      new StorageService(createStorageDriver()),
      {
        retentionDays: 7,
      },
    );

    expect(result.removed).toContain(orphanPublicId);
    expect(result.removed).not.toContain(avatarPublicId);

    const remaining = await prisma.uploadedFile.findMany({
      where: {
        publicId: {
          in: [orphanPublicId, avatarPublicId, freshPublicId, linkedPublicId],
        },
      },
      select: { publicId: true },
    });
    expect(remaining.map((row) => row.publicId).sort()).toEqual(
      [avatarPublicId, freshPublicId, linkedPublicId].sort(),
    );

    expect(await exists(join(uploadRoot, orphanPublicId))).toBe(false);
    expect(await exists(join(uploadRoot, avatarPublicId))).toBe(true);
    expect(await exists(join(uploadRoot, freshPublicId))).toBe(true);
    expect(await exists(join(uploadRoot, linkedPublicId))).toBe(true);
  });

  it('xoá được row mồ côi mà file đã mất trên đĩa, không ném lỗi', async () => {
    // Cố ý không ghi file: cron phải dọn được row kể cả khi file đã bị xoá tay.
    await prisma.uploadedFile.create({
      data: fileRow(ghostPublicId, userId, cutoffBefore(30)),
    });

    const result = await removeOrphanUploads(
      prisma,
      new StorageService(createStorageDriver()),
      {
        retentionDays: 7,
      },
    );

    expect(result.removed).toContain(ghostPublicId);
    expect(
      await prisma.uploadedFile.count({ where: { publicId: ghostPublicId } }),
    ).toBe(0);
  });
});
