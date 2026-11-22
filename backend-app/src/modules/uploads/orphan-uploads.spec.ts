import { describe, expect, it, jest } from '@jest/globals';
import { removeOrphanUploads } from './orphan-uploads';

const NOW = new Date('2026-11-22T00:00:00.000Z');

function setup(
  orphanIds: string[] = [],
  avatarUrls: (string | null)[] = [],
) {
  const findUsers = jest.fn(
    async (_args: unknown) => avatarUrls.map((avatarUrl) => ({ avatarUrl })),
  );
  const findOrphans = jest.fn(
    async (_args: unknown) => orphanIds.map((publicId) => ({ publicId })),
  );
  const deleteOrphan = jest.fn<(args: unknown) => Promise<void>>(
    async () => undefined,
  );
  const removeMany = jest.fn<(ids: string[]) => Promise<void>>(
    async () => undefined,
  );

  const prisma = {
    user: { findMany: findUsers },
    uploadedFile: { findMany: findOrphans, delete: deleteOrphan },
  };

  return {
    prisma: prisma as unknown as Parameters<typeof removeOrphanUploads>[0],
    storage: { removeMany } as unknown as Parameters<typeof removeOrphanUploads>[1],
    findUsers,
    findOrphans,
    deleteOrphan,
    removeMany,
  };
}

describe('removeOrphanUploads', () => {
  it('chọn đúng file mồ côi theo retention và loại avatar đang dùng', async () => {
    const { prisma, storage, findUsers, findOrphans, deleteOrphan, removeMany } =
      setup(['documents/a.pdf', 'avatars/cu.png'], ['/api/files/avatars/dang-dung.png']);

    const result = await removeOrphanUploads(prisma, storage, {
      retentionDays: 7,
      now: NOW,
    });

    const cutoff = new Date('2026-11-15T00:00:00.000Z');
    expect(findUsers).toHaveBeenCalledWith({
      where: { avatarUrl: { startsWith: '/api/files/' } },
      select: { avatarUrl: true },
    });
    expect(findOrphans).toHaveBeenCalledWith({
      where: {
        documentId: null,
        createdAt: { lt: cutoff },
        url: { notIn: ['/api/files/avatars/dang-dung.png'] },
      },
      select: { publicId: true },
    });

    expect(deleteOrphan).toHaveBeenCalledTimes(2);
    expect(deleteOrphan).toHaveBeenCalledWith({
      where: { publicId: 'documents/a.pdf', documentId: null },
    });
    expect(removeMany).toHaveBeenCalledWith(['documents/a.pdf', 'avatars/cu.png']);
    expect(result).toEqual({
      cutoff,
      scanned: 2,
      removed: ['documents/a.pdf', 'avatars/cu.png'],
    });
  });

  it('xoá row DB trước rồi mới xoá file trên storage', async () => {
    const { prisma, storage, deleteOrphan, removeMany } = setup(['documents/a.pdf']);

    await removeOrphanUploads(prisma, storage, { retentionDays: 7, now: NOW });

    expect(deleteOrphan.mock.invocationCallOrder[0]).toBeLessThan(
      removeMany.mock.invocationCallOrder[0],
    );
  });

  it('bỏ qua file vừa được gắn tài liệu giữa lúc quét và lúc xoá', async () => {
    const { prisma, storage, deleteOrphan, removeMany } = setup([
      'documents/vua-gan.pdf',
      'documents/mo-coi.pdf',
    ]);
    deleteOrphan.mockRejectedValueOnce(new Error('P2025'));
    const log = jest.fn();

    const result = await removeOrphanUploads(prisma, storage, {
      retentionDays: 7,
      now: NOW,
      log,
    });

    expect(result.removed).toEqual(['documents/mo-coi.pdf']);
    expect(removeMany).toHaveBeenCalledWith(['documents/mo-coi.pdf']);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('vừa được dùng cho tài liệu'));
  });

  it('không đụng storage khi không có file mồ côi', async () => {
    const { prisma, storage, removeMany } = setup();

    const result = await removeOrphanUploads(prisma, storage, {
      retentionDays: 7,
      now: NOW,
    });

    expect(result).toEqual({
      cutoff: new Date('2026-11-15T00:00:00.000Z'),
      scanned: 0,
      removed: [],
    });
    expect(removeMany).not.toHaveBeenCalled();
  });

  it('bỏ avatar null khỏi danh sách loại trừ', async () => {
    const { prisma, storage, findOrphans } = setup([], [null]);

    await removeOrphanUploads(prisma, storage, { retentionDays: 7, now: NOW });

    expect(findOrphans).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ url: { notIn: [] } }) }),
    );
  });
});
