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

interface SettingsPayload {
  uploadsEnabled: boolean;
  updatedAt: string | null;
}

const password = 'MatKhau123';
const SETTING_KEY = 'document.uploadsEnabled';

/**
 * E2E thật với Postgres cho cấu hình hệ thống:
 * admin đọc/ghi công tắc đăng bài, sinh viên không đọc/ghi được, tắt là chặn tạo bài
 * mới ngay lập tức và bật lại thì đăng được.
 */
describe('Cấu hình hệ thống (e2e)', () => {
  const suffix = Date.now();

  let app: INestApplication;
  let prisma: PrismaService;
  let subjectId: string;
  let adminToken: string;
  let userToken: string;

  const userIds: string[] = [];

  /** Map token → userId để seed `UploadedFile` (create document cần file đã upload). */
  const userIdByToken = new Map<string, string>();

  const server = () => request(app.getHttpServer());
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function login(email: string): Promise<string> {
    const response = await server().post('/api/auth/login').send({ email, password }).expect(201);

    return (response.body as Envelope<{ accessToken: string }>).data.accessToken;
  }

  async function setEnabled(token: string, uploadsEnabled: boolean): Promise<SettingsPayload> {
    const response = await server()
      .patch('/api/admin/settings')
      .set(bearer(token))
      .send({ uploadsEnabled })
      .expect(200);

    return (response.body as Envelope<SettingsPayload>).data;
  }

  async function createDocument(token: string, title: string): Promise<number> {
    // Tạo sẵn bản ghi UploadedFile thay cho bước upload nhị phân: body chỉ được
    // tham chiếu file đã tồn tại và thuộc chính người dùng.
    const ownerId = userIdByToken.get(token);
    const publicId = `documents/e2e-${Date.now()}-${Math.random().toString(16).slice(2)}.pdf`;

    if (ownerId) {
      await prisma.uploadedFile.create({
        data: {
          publicId,
          url: `/api/files/${publicId}`,
          name: 'e2e-enabled.pdf',
          size: 1024,
          mimeType: 'application/pdf',
          folder: 'documents',
          ownerId,
        },
      });
    }

    const response = await server()
      .post('/api/documents')
      .set(bearer(token))
      .send({
        title,
        description: 'Bài kiểm thử công tắc đăng bài',
        subjectId,
        files: [
          {
            publicId,
            url: `/api/files/${publicId}`,
            name: 'e2e-enabled.pdf',
            size: 1024,
            mimeType: 'application/pdf',
          },
        ],
      });

    return response.status;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    applyAppSettings(app);
    await app.init();

    prisma = app.get(PrismaService);
    const passwordHash = await bcrypt.hash(password, 10);
    const userData = (name: string, email: string, extra: Record<string, unknown> = {}) => ({
      email,
      passwordHash,
      fullName: name,
      emailVerifiedAt: new Date(),
      ...extra,
    });

    const admin = await prisma.user.create({
      data: userData('E2E Quản trị cấu hình', `e2e-settings-admin-${suffix}@example.com`, {
        role: Role.ADMIN,
      }),
      select: { id: true, email: true },
    });
    const user = await prisma.user.create({
      data: userData('E2E Sinh viên cấu hình', `e2e-settings-user-${suffix}@example.com`),
      select: { id: true, email: true },
    });

    userIds.push(admin.id, user.id);

    const subject = await prisma.subject.create({
      data: { code: `SET${suffix}`.slice(0, 20), name: 'Môn E2E cấu hình' },
      select: { id: true },
    });
    subjectId = subject.id;

    adminToken = await login(admin.email);
    userToken = await login(user.email);
    userIdByToken.set(adminToken, admin.id);
    userIdByToken.set(userToken, user.id);

    // Trạng thái đầu của suite: cho phép đăng bài.
    await prisma.systemSetting.upsert({
      where: { key: SETTING_KEY },
      update: { value: true },
      create: { key: SETTING_KEY, value: true },
    });
  });

  afterAll(async () => {
    await prisma.systemSetting.upsert({
      where: { key: SETTING_KEY },
      update: { value: true },
      create: { key: SETTING_KEY, value: true },
    });
    await prisma.expLog.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.document.deleteMany({ where: { authorId: { in: userIds } } });
    await prisma.uploadedFile.deleteMany({ where: { ownerId: { in: userIds } } });
    await prisma.subject.deleteMany({ where: { id: subjectId } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  it('admin đọc và bật/tắt; sinh viên bị chặn và giá trị sai bị từ chối', async () => {
    const current = await server()
      .get('/api/admin/settings')
      .set(bearer(adminToken))
      .expect(200);
    expect(typeof (current.body as Envelope<SettingsPayload>).data.uploadsEnabled).toBe('boolean');

    expect(await setEnabled(adminToken, false)).toEqual(
      expect.objectContaining({ uploadsEnabled: false }),
    );

    await server().get('/api/admin/settings').set(bearer(userToken)).expect(403);
    await server()
      .patch('/api/admin/settings')
      .set(bearer(userToken))
      .send({ uploadsEnabled: false })
      .expect(403);

    // DTO chỉ nhận boolean thật.
    await server()
      .patch('/api/admin/settings')
      .set(bearer(adminToken))
      .send({ uploadsEnabled: 'false' })
      .expect(400);
    await server().patch('/api/admin/settings').set(bearer(adminToken)).send({}).expect(400);
  });

  it('tắt đăng bài → sinh viên bị chặn 403; bật lại thì đăng được', async () => {
    await setEnabled(adminToken, false);

    const settings = await server()
      .get('/api/admin/settings')
      .set(bearer(adminToken))
      .expect(200);
    expect((settings.body as Envelope<SettingsPayload>).data.uploadsEnabled).toBe(false);

    expect(await createDocument(userToken, `Bài E2E khi bị khoá ${suffix}`)).toBe(403);

    await setEnabled(adminToken, true);

    expect(await createDocument(userToken, `Bài E2E sau khi mở lại ${suffix}`)).toBe(201);
  });
});
