import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { NotificationType, Role } from '../src/generated/prisma/client';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { applyAppSettings } from './create-test-app';

interface Envelope<T> {
  success: boolean;
  data: T;
}

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

interface NotificationPage {
  items: NotificationItem[];
  meta: { page: number; limit: number; total: number; totalPages: number };
  unreadCount: number;
}

/**
 * E2E thật với Postgres cho thông báo:
 * duyệt / từ chối / xoá bài của admin, phân trang, thông báo chung và đánh dấu đã đọc.
 * User + tài liệu được tạo trực tiếp bằng Prisma để test chỉ tập trung vào thông báo.
 */
describe('Thông báo (e2e)', () => {
  const suffix = Date.now();
  const password = 'MatKhau123';

  let app: INestApplication;
  let prisma: PrismaService;
  let subjectId: string;
  let authorId: string;
  let authorToken: string;
  let otherToken: string;
  let adminToken: string;
  let approveNotificationId: string;

  const userIds: string[] = [];
  const notificationIds: string[] = [];

  const server = () => request(app.getHttpServer());
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function login(email: string): Promise<string> {
    const response = await server().post('/api/auth/login').send({ email, password }).expect(201);

    return (response.body as Envelope<{ accessToken: string }>).data.accessToken;
  }

  async function notifications(token: string, query = ''): Promise<NotificationPage> {
    const response = await server()
      .get(`/api/notifications${query}`)
      .set(bearer(token))
      .expect(200);

    return (response.body as Envelope<NotificationPage>).data;
  }

  async function createDocument(title: string): Promise<string> {
    const document = await prisma.document.create({
      data: { title, subjectId, authorId },
      select: { id: true },
    });

    return document.id;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    applyAppSettings(app);
    await app.init();

    prisma = app.get(PrismaService);
    const passwordHash = await bcrypt.hash(password, 10);

    const author = await prisma.user.create({
      data: {
        email: `e2e-notify-author-${suffix}@example.com`,
        passwordHash,
        fullName: 'E2E Tác giả',
        emailVerifiedAt: new Date(),
      },
      select: { id: true, email: true },
    });
    const other = await prisma.user.create({
      data: {
        email: `e2e-notify-other-${suffix}@example.com`,
        passwordHash,
        fullName: 'E2E Người khác',
        emailVerifiedAt: new Date(),
      },
      select: { id: true, email: true },
    });
    const admin = await prisma.user.create({
      data: {
        email: `e2e-notify-admin-${suffix}@example.com`,
        passwordHash,
        fullName: 'E2E Quản trị',
        role: Role.ADMIN,
        emailVerifiedAt: new Date(),
      },
      select: { id: true, email: true },
    });

    userIds.push(author.id, other.id, admin.id);
    authorId = author.id;

    const subject = await prisma.subject.create({
      data: { code: `NTF${suffix}`.slice(0, 20), name: 'Môn E2E thông báo' },
      select: { id: true },
    });
    subjectId = subject.id;

    authorToken = await login(author.email);
    otherToken = await login(other.email);
    adminToken = await login(admin.email);
  });

  afterAll(async () => {
    // Duyệt bài cộng EXP (ExpLog) — bảng này không cascade theo user.
    await prisma.expLog.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.notification.deleteMany({
      where: { OR: [{ id: { in: notificationIds } }, { userId: { in: userIds } }] },
    });
    await prisma.document.deleteMany({ where: { authorId: { in: userIds } } });
    await prisma.subject.deleteMany({ where: { id: subjectId } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  it('duyệt bài → tác giả nhận thông báo, người khác không thấy', async () => {
    const documentId = await createDocument(`Bài E2E duyệt ${suffix}`);

    await server()
      .patch(`/api/admin/documents/${documentId}/approve`)
      .set(bearer(adminToken))
      .expect(200);

    const page = await notifications(authorToken);
    expect(page.meta.total).toBe(1);
    expect(page.items[0].type).toBe('DOCUMENT_APPROVED');
    expect(page.items[0].link).toBe(`/documents/${documentId}`);
    expect(page.unreadCount).toBe(1);
    approveNotificationId = page.items[0].id;

    const otherPage = await notifications(otherToken);
    expect(otherPage.items).toHaveLength(0);
    expect(otherPage.unreadCount).toBe(0);
  });

  it('phân trang và thông báo chung (userId null) hiện với mọi người', async () => {
    await prisma.notification.createMany({
      data: [1, 2, 3].map((index) => ({
        type: NotificationType.SYSTEM,
        title: `Tin cá nhân ${index}`,
        message: 'Nội dung tin cá nhân',
        userId: authorId,
      })),
    });

    const broadcast = await prisma.notification.create({
      data: {
        type: NotificationType.SYSTEM,
        title: 'Tin chung E2E',
        message: 'Thông báo chung cho mọi sinh viên',
        userId: null,
      },
      select: { id: true },
    });

    const created = await prisma.notification.findMany({
      where: { OR: [{ userId: authorId }, { userId: null }] },
      select: { id: true },
    });
    notificationIds.push(...created.map((item) => item.id));

    const firstPage = await notifications(authorToken, '?limit=2&page=1');
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.meta.total).toBe(5);
    expect(firstPage.meta.totalPages).toBe(3);
    expect(firstPage.unreadCount).toBe(5);

    const secondPage = await notifications(authorToken, '?limit=2&page=2');
    const thirdPage = await notifications(authorToken, '?limit=2&page=3');
    expect(thirdPage.items).toHaveLength(1);

    const ids = [...firstPage.items, ...secondPage.items, ...thirdPage.items].map((item) => item.id);
    expect(new Set(ids).size).toBe(5);

    // Người khác chỉ thấy thông báo chung.
    const otherPage = await notifications(otherToken, '?limit=50');
    expect(otherPage.meta.total).toBe(1);
    expect(otherPage.items[0].id).toBe(broadcast.id);
  });

  it('đọc từng tin: chỉ chủ tin đọc được; đọc tất cả chỉ áp dụng tin cá nhân', async () => {
    await server()
      .patch(`/api/notifications/${approveNotificationId}/read`)
      .set(bearer(otherToken))
      .expect(404);

    const read = await server()
      .patch(`/api/notifications/${approveNotificationId}/read`)
      .set(bearer(authorToken))
      .expect(200);
    expect((read.body as Envelope<{ readAt: string }>).data.readAt).toBeTruthy();

    let page = await notifications(authorToken, '?limit=50');
    expect(page.unreadCount).toBe(4);
    expect(page.items.find((item) => item.id === approveNotificationId)?.readAt).not.toBeNull();

    const markAll = await server()
      .patch('/api/notifications/read-all')
      .set(bearer(authorToken))
      .expect(200);
    expect((markAll.body as Envelope<{ updated: number }>).data.updated).toBe(3);

    page = await notifications(authorToken, '?limit=50');
    // Chỉ còn tin chung là chưa đọc: markAllRead không đụng thông báo broadcast.
    expect(page.unreadCount).toBe(1);
  });

  it('từ chối bài → thông báo kèm lý do để tác giả sửa', async () => {
    const documentId = await createDocument(`Bài E2E từ chối ${suffix}`);

    await server()
      .patch(`/api/admin/documents/${documentId}/reject`)
      .set(bearer(adminToken))
      .send({ reason: 'Thiếu nguồn tham khảo' })
      .expect(200);

    const page = await notifications(authorToken, '?limit=50');
    const rejected = page.items.find((item) => item.type === 'DOCUMENT_REJECTED');

    expect(rejected).toBeDefined();
    expect(rejected?.message).toContain('Thiếu nguồn tham khảo');
    expect(rejected?.link).toBe(`/documents/${documentId}`);
  });

  it('admin xoá bài → tác giả nhận thông báo DOCUMENT_DELETED', async () => {
    const title = `Bài E2E bị xoá ${suffix}`;
    const documentId = await createDocument(title);

    await server()
      .delete(`/api/admin/documents/${documentId}`)
      .set(bearer(adminToken))
      .expect(200);

    const page = await notifications(authorToken, '?limit=50');
    const deleted = page.items.find((item) => item.type === 'DOCUMENT_DELETED');

    expect(deleted).toBeDefined();
    expect(deleted?.message).toContain(title);
    // Bài đã biến mất nên thông báo không kèm link.
    expect(deleted?.link).toBeNull();
  });

  it('admin gửi thông báo hàng loạt → mọi người thấy, sinh viên không gửi được', async () => {
    const payload = {
      title: `Thông báo E2E ${suffix}`,
      message: 'Hệ thống bảo trì từ 22:00 đến 23:00 tối nay.',
    };

    await server()
      .post('/api/admin/notifications/broadcast')
      .set(bearer(authorToken))
      .send(payload)
      .expect(403);

    const response = await server()
      .post('/api/admin/notifications/broadcast')
      .set(bearer(adminToken))
      .send(payload)
      .expect(201);
    const created = (
      response.body as Envelope<{ id: string; type: string; title: string; link: string | null }>
    ).data;

    notificationIds.push(created.id);
    expect(created.type).toBe('SYSTEM');
    expect(created.title).toBe(payload.title);

    const authorPage = await notifications(authorToken, '?limit=50');
    expect(authorPage.items.some((item) => item.id === created.id)).toBe(true);

    const otherPage = await notifications(otherToken, '?limit=50');
    expect(otherPage.items.some((item) => item.id === created.id)).toBe(true);

    // Nội dung quá ngắn bị DTO từ chối.
    await server()
      .post('/api/admin/notifications/broadcast')
      .set(bearer(adminToken))
      .send({ title: 'ab', message: 'ngan' })
      .expect(400);
  });
});
