import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { Role } from '../src/generated/prisma/client';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { applyAppSettings } from './create-test-app';

interface Envelope<T> {
  success: boolean;
  data: T;
}

interface NotificationItem {
  id: string;
  type: string;
  message: string;
  readAt: string | null;
}

interface NotificationPage {
  items: NotificationItem[];
  unreadCount: number;
}

/**
 * E2E hồi quy cho 5 lỗi đã sửa — mỗi `it` là một lỗi, không phụ thuộc nhau:
 *  1. admin cảnh báo tài khoản → sinh viên nhận thông báo `ACCOUNT_WARNING`;
 *  2. xoá môn không còn tài liệu → row bị xoá **thật** khỏi DB (trước đây chỉ set deletedAt);
 *  3. xoá môn còn tài liệu → 409 và môn vẫn còn;
 *  4. đổi mật khẩu → phiên hiện tại dùng được ngay, không phải đăng nhập lại;
 *  5. thông báo chung (broadcast) có trạng thái "đã đọc" riêng từng user, nên reload
 *     không hiện lại badge chưa đọc.
 *
 * User/tài liệu được tạo trực tiếp bằng Prisma để test chỉ tập trung vào hành vi cần kiểm.
 */
describe('Hồi quy 5 lỗi đã sửa (e2e)', () => {
  const suffix = Date.now();
  const password = 'MatKhau123';

  let app: INestApplication;
  let prisma: PrismaService;

  let adminToken: string;
  let warnedStudentId: string;
  let warnedStudentToken: string;
  let passwordStudentEmail: string;
  let passwordStudentToken: string;
  let readerAToken: string;
  let readerBToken: string;

  const userIds: string[] = [];
  const subjectIds: string[] = [];
  const documentIds: string[] = [];
  const notificationIds: string[] = [];

  const server = () => request(app.getHttpServer());
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function login(email: string, loginPassword = password): Promise<string> {
    const response = await server()
      .post('/api/auth/login')
      .send({ email, password: loginPassword })
      .expect(201);

    return (response.body as Envelope<{ accessToken: string }>).data.accessToken;
  }

  async function notifications(token: string): Promise<NotificationPage> {
    const response = await server()
      .get('/api/notifications?limit=50')
      .set(bearer(token))
      .expect(200);

    return (response.body as Envelope<NotificationPage>).data;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    applyAppSettings(app);
    await app.init();

    prisma = app.get(PrismaService);
    const passwordHash = await bcrypt.hash(password, 10);

    // `slug` phải là ASCII: `@IsEmail` của LoginDto từ chối email có dấu tiếng Việt.
    const createStudent = async (slug: string, fullName: string) => {
      const user = await prisma.user.create({
        data: {
          email: `e2e-regression-${slug}-${suffix}@example.com`,
          passwordHash,
          fullName,
          emailVerifiedAt: new Date(),
        },
        select: { id: true, email: true },
      });

      userIds.push(user.id);

      return user;
    };

    const admin = await prisma.user.create({
      data: {
        email: `e2e-regression-admin-${suffix}@example.com`,
        passwordHash,
        fullName: 'E2E Quản trị',
        role: Role.ADMIN,
        emailVerifiedAt: new Date(),
      },
      select: { id: true, email: true },
    });
    userIds.push(admin.id);

    const warnedStudent = await createStudent('warned', 'E2E Sinh viên bị cảnh báo');
    const passwordStudent = await createStudent('password', 'E2E Sinh viên đổi mật khẩu');
    const readerA = await createStudent('reader-a', 'E2E Độc giả A');
    const readerB = await createStudent('reader-b', 'E2E Độc giả B');

    warnedStudentId = warnedStudent.id;
    passwordStudentEmail = passwordStudent.email;

    adminToken = await login(admin.email);
    warnedStudentToken = await login(warnedStudent.email);
    passwordStudentToken = await login(passwordStudent.email);
    readerAToken = await login(readerA.email);
    readerBToken = await login(readerB.email);
  });

  afterAll(async () => {
    // ExpLog và UserWarning không cascade theo User nên phải xoá trước.
    await prisma.expLog.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userWarning.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.notification.deleteMany({
      where: { OR: [{ userId: { in: userIds } }, { id: { in: notificationIds } }] },
    });
    await prisma.document.deleteMany({ where: { id: { in: documentIds } } });
    await prisma.subject.deleteMany({ where: { id: { in: subjectIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  it('1. cảnh báo của admin tạo thông báo ACCOUNT_WARNING cho sinh viên', async () => {
    const reason = 'Đăng tài liệu sai môn quá nhiều lần';

    await server()
      .post(`/api/admin/users/${warnedStudentId}/warnings`)
      .set(bearer(adminToken))
      .send({ reason })
      .expect(201);

    const page = await notifications(warnedStudentToken);

    expect(page.items).toHaveLength(1);
    expect(page.items[0].type).toBe('ACCOUNT_WARNING');
    expect(page.items[0].message).toContain(reason);
    expect(page.items[0].readAt).toBeNull();
    expect(page.unreadCount).toBe(1);
    notificationIds.push(page.items[0].id);
  });

  it('2. xoá môn không còn tài liệu → row bị xoá thật khỏi DB', async () => {
    const subject = await prisma.subject.create({
      data: { code: `REG${suffix}`.slice(0, 20), name: 'Môn E2E không có tài liệu' },
      select: { id: true },
    });
    subjectIds.push(subject.id);

    await server()
      .delete(`/api/admin/subjects/${subject.id}`)
      .set(bearer(adminToken))
      .expect(200);

    expect(await prisma.subject.findUnique({ where: { id: subject.id } })).toBeNull();
  });

  it('3. xoá môn còn tài liệu → 409 và môn vẫn còn', async () => {
    const subject = await prisma.subject.create({
      data: { code: `REGB${suffix}`.slice(0, 20), name: 'Môn E2E còn tài liệu' },
      select: { id: true },
    });
    subjectIds.push(subject.id);

    const document = await prisma.document.create({
      data: { title: 'Bài E2E còn hiệu lực', subjectId: subject.id, authorId: warnedStudentId },
      select: { id: true },
    });
    documentIds.push(document.id);

    await server()
      .delete(`/api/admin/subjects/${subject.id}`)
      .set(bearer(adminToken))
      .expect(409);

    expect(await prisma.subject.findUnique({ where: { id: subject.id } })).not.toBeNull();
    expect(await prisma.document.findUnique({ where: { id: document.id } })).not.toBeNull();
  });

  it('4. đổi mật khẩu xong vẫn dùng phiên hiện tại, không phải đăng nhập lại', async () => {
    const newPassword = 'MatKhau456';

    const response = await server()
      .patch('/api/auth/password')
      .set(bearer(passwordStudentToken))
      .send({ currentPassword: password, newPassword })
      .expect(200);

    const session = (
      response.body as Envelope<{
        message: string;
        accessToken: string;
        user: { email: string };
      }>
    ).data;

    expect(session.accessToken).toEqual(expect.any(String));
    expect(session.user.email).toBe(passwordStudentEmail);
    // Cookie refresh token được set lại cho phiên mới.
    expect(String(response.headers['set-cookie'])).toContain('lh_refresh');

    // Token mới dùng được ngay — không có bước đăng nhập lại nào.
    await server().get('/api/notifications').set(bearer(session.accessToken)).expect(200);

    // Mật khẩu mới có hiệu lực, mật khẩu cũ không còn dùng được.
    await server()
      .post('/api/auth/login')
      .send({ email: passwordStudentEmail, password: newPassword })
      .expect(201);
    await server()
      .post('/api/auth/login')
      .send({ email: passwordStudentEmail, password })
      .expect(401);
  });

  it('5. thông báo chung: đã đọc tính riêng từng user và giữ nguyên sau khi tải lại', async () => {
    const created = await server()
      .post('/api/admin/notifications/broadcast')
      .set(bearer(adminToken))
      .send({
        title: 'Bảo trì hệ thống',
        message: 'Hệ thống bảo trì lúc 22h hôm nay, mong các bạn lưu ý.',
      })
      .expect(201);

    const broadcastId = (created.body as Envelope<{ id: string }>).data.id;
    notificationIds.push(broadcastId);

    const before = await notifications(readerAToken);
    expect(before.items[0].id).toBe(broadcastId);
    expect(before.items[0].readAt).toBeNull();
    expect(before.unreadCount).toBe(1);

    await server()
      .patch(`/api/notifications/${broadcastId}/read`)
      .set(bearer(readerAToken))
      .expect(200);

    const after = await notifications(readerAToken);
    expect(after.unreadCount).toBe(0);
    expect(after.items[0].readAt).not.toBeNull();

    // Tải lại lần nữa (đọc từ DB, không dùng state client) vẫn 0 — đây chính là lỗi badge.
    expect((await notifications(readerAToken)).unreadCount).toBe(0);

    // Người khác vẫn còn chưa đọc: trạng thái đọc không bị dùng chung.
    expect((await notifications(readerBToken)).unreadCount).toBe(1);

    // "Đọc tất cả" cũng ghi trạng thái đọc riêng cho từng user.
    await server().patch('/api/notifications/read-all').set(bearer(readerBToken)).expect(200);
    expect((await notifications(readerBToken)).unreadCount).toBe(0);
  });
});
