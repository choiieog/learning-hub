import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { cutoffBefore } from '../src/common/utils/retention.util';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { pruneRetentionData } from '../src/modules/maintenance/prune-retention';

/**
 * E2E thật cho các section còn lại của `scripts/prune-data.ts` (trừ file mồ côi, đã có
 * suite riêng): Postgres thật, seed đủ dữ liệu hai bên mốc retention rồi chạy đúng hàm
 * mà cron gọi.
 *
 * Mỗi bảng có một cặp row "cũ hơn mốc" (phải mất) và "mới" (phải còn). Riêng `DocumentView`
 * thêm row nằm **đúng** mốc cutoff: `createdAt: { lt }` nên nó phải còn.
 *
 * Assertion chính là trạng thái DB theo id của chính suite này, không so tổng số toàn bảng:
 * DB e2e dùng chung có thể còn row cũ từ suite/lần chạy khác và việc dọn chúng là hành vi
 * đúng của cron.
 */
describe('Dọn dữ liệu theo retention (e2e)', () => {
  const suffix = Date.now();
  const days = 180;
  const now = new Date();
  const cutoff = cutoffBefore(days, now);
  const old = cutoffBefore(days + 1, now);
  const recent = cutoffBefore(10, now);

  const email = `e2e-prune-${suffix}@example.com`;
  const readerEmail = `e2e-prune-reader-${suffix}@example.com`;
  const subjectCode = `E2E-PRUNE-${suffix}`;

  let prisma: PrismaService;
  let subjectId: string;
  let documentId: string;
  let userId: string;
  let readerId: string;

  const viewIds: string[] = [];
  const notificationIds: string[] = [];
  const expLogIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const [user, reader] = await Promise.all([
      prisma.user.create({
        data: {
          email,
          passwordHash: 'x',
          fullName: 'E2E Prune',
          emailVerifiedAt: now,
        },
      }),
      prisma.user.create({
        data: {
          email: readerEmail,
          passwordHash: 'x',
          fullName: 'E2E Prune Reader',
          emailVerifiedAt: now,
        },
      }),
    ]);
    userId = user.id;
    readerId = reader.id;

    const subject = await prisma.subject.create({
      data: { code: subjectCode, name: 'Môn cho dọn retention' },
    });
    subjectId = subject.id;
    const document = await prisma.document.create({
      data: { title: 'Bài có lượt xem cũ', subjectId, authorId: userId },
    });
    documentId = document.id;

    const views = await Promise.all([
      // Cũ hơn mốc đúng 1ms → bị xoá.
      prisma.documentView.create({
        data: {
          documentId,
          viewerKey: readerId,
          dayKey: 'old',
          createdAt: new Date(cutoff.getTime() - 1),
        },
      }),
      // Đúng mốc cutoff → `lt` không khớp, phải còn.
      prisma.documentView.create({
        data: {
          documentId,
          viewerKey: readerId,
          dayKey: 'edge',
          createdAt: cutoff,
        },
      }),
      prisma.documentView.create({
        data: {
          documentId,
          viewerKey: readerId,
          dayKey: 'recent',
          createdAt: recent,
        },
      }),
    ]);
    viewIds.push(...views.map((view) => view.id));

    const notifications = await Promise.all([
      // Broadcast cũ hơn mốc → xoá kèm các read row.
      prisma.notification.create({
        data: {
          type: 'SYSTEM',
          title: 'Thông báo chung cũ',
          message: 'cũ',
          createdAt: old,
        },
      }),
      prisma.notification.create({
        data: {
          type: 'SYSTEM',
          title: 'Thông báo chung mới',
          message: 'mới',
          createdAt: recent,
        },
      }),
      // Cá nhân, chưa đọc, rất cũ → giữ: người dùng còn chưa xem.
      prisma.notification.create({
        data: {
          type: 'DOCUMENT_APPROVED',
          title: 'Chưa đọc cũ',
          message: 'cũ',
          userId,
          createdAt: old,
        },
      }),
      // Cá nhân, đã đọc, cũ hơn mốc → xoá.
      prisma.notification.create({
        data: {
          type: 'DOCUMENT_APPROVED',
          title: 'Đã đọc cũ',
          message: 'cũ',
          userId,
          readAt: old,
          createdAt: old,
        },
      }),
      prisma.notification.create({
        data: {
          type: 'DOCUMENT_APPROVED',
          title: 'Đã đọc mới',
          message: 'mới',
          userId,
          readAt: recent,
          createdAt: cutoffBefore(20, now),
        },
      }),
    ]);
    notificationIds.push(
      ...notifications.map((notification) => notification.id),
    );

    const [staleBroadcast, freshBroadcast] = notifications;
    await prisma.notificationRead.createMany({
      data: [
        { notificationId: staleBroadcast.id, userId },
        { notificationId: staleBroadcast.id, userId: readerId },
        { notificationId: freshBroadcast.id, userId },
      ],
    });

    const expLogs = await Promise.all([
      prisma.expLog.create({
        data: { userId, delta: 5, reason: 'VIEW', createdAt: old },
      }),
      prisma.expLog.create({
        data: { userId, delta: 5, reason: 'VIEW', createdAt: recent },
      }),
    ]);
    expLogIds.push(...expLogs.map((log) => log.id));
  });

  afterAll(async () => {
    await prisma.notificationRead.deleteMany({
      where: { userId: { in: [userId, readerId] } },
    });
    await prisma.notification.deleteMany({
      where: { id: { in: notificationIds } },
    });
    await prisma.documentView.deleteMany({ where: { id: { in: viewIds } } });
    await prisma.expLog.deleteMany({ where: { id: { in: expLogIds } } });
    await prisma.document.deleteMany({ where: { id: documentId } });
    await prisma.subject.deleteMany({ where: { id: subjectId } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, readerId] } } });
    await prisma.$disconnect();
  });

  it('xoá dòng cũ hơn mốc, giữ dòng trong cửa sổ retention', async () => {
    const [staleBroadcastId, freshBroadcastId, unreadOldId, , readFreshId] =
      notificationIds;

    // Chốt seed trước khi chạy: nếu không có read row nào thì assertion "còn 0" dưới đây
    // sẽ xanh một cách vô nghĩa.
    expect(
      await prisma.notificationRead.count({
        where: { notificationId: staleBroadcastId },
      }),
    ).toBe(2);

    const result = await pruneRetentionData(prisma, {
      documentViewDays: days,
      notificationReadDays: days,
      personalNotificationDays: days,
      expLogDays: days,
      now,
    });

    // Số đếm toàn bảng có thể gồm row sót của suite khác, nên chỉ chặn "có xoá".
    expect(result.documentViews.deleted).toBeGreaterThanOrEqual(1);
    expect(result.broadcasts.deleted).toBeGreaterThanOrEqual(1);
    expect(result.broadcasts.reads).toBeGreaterThanOrEqual(2);
    expect(result.personalNotifications.deleted).toBeGreaterThanOrEqual(1);
    expect(result.expLogs.deleted).toBeGreaterThanOrEqual(1);

    const [, edgeView, recentView] = viewIds;
    const remainingViews = await prisma.documentView.findMany({
      where: { id: { in: viewIds } },
      select: { id: true },
    });
    expect(remainingViews.map((row) => row.id).sort()).toEqual(
      [edgeView, recentView].sort(),
    );

    const remainingNotifications = await prisma.notification.findMany({
      where: { id: { in: notificationIds } },
      select: { id: true },
    });
    expect(remainingNotifications.map((row) => row.id).sort()).toEqual(
      [freshBroadcastId, unreadOldId, readFreshId].sort(),
    );

    // Xoá broadcast phải cascade read row của chính nó, và không đụng broadcast mới.
    expect(
      await prisma.notificationRead.count({
        where: { notificationId: staleBroadcastId },
      }),
    ).toBe(0);
    expect(
      await prisma.notificationRead.count({
        where: { notificationId: freshBroadcastId },
      }),
    ).toBe(1);

    const [, freshLogId] = expLogIds;
    const remainingLogs = await prisma.expLog.findMany({
      where: { id: { in: expLogIds } },
      select: { id: true },
    });
    expect(remainingLogs.map((row) => row.id)).toEqual([freshLogId]);
  });
});
