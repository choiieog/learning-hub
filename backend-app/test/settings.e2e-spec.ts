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
  documentDailyLimit: number;
  updatedAt: string | null;
}

const password = 'MatKhau123';

/**
 * E2E thật với Postgres cho cấu hình hệ thống:
 * admin đọc/ghi giới hạn đăng bài, sinh viên không đọc/ghi được, giới hạn được áp dụng
 * theo ngày (bài của hôm trước không tính) và 0 nghĩa là tắt giới hạn.
 */
describe('Cấu hình hệ thống (e2e)', () => {
  const suffix = Date.now();

  let app: INestApplication;
  let prisma: PrismaService;
  let subjectId: string;
  let adminToken: string;
  let userToken: string;
  let secondUserToken: string;
  let secondUserId: string;

  const userIds: string[] = [];

  const server = () => request(app.getHttpServer());
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function login(email: string): Promise<string> {
    const response = await server().post('/api/auth/login').send({ email, password }).expect(201);

    return (response.body as Envelope<{ accessToken: string }>).data.accessToken;
  }

  async function setLimit(token: string, documentDailyLimit: number): Promise<SettingsPayload> {
    const response = await server()
      .patch('/api/admin/settings')
      .set(bearer(token))
      .send({ documentDailyLimit })
      .expect(200);

    return (response.body as Envelope<SettingsPayload>).data;
  }

  async function createDocument(token: string, title: string): Promise<number> {
    const response = await server()
      .post('/api/documents')
      .set(bearer(token))
      .send({
        title,
        description: 'Bài kiểm thử giới hạn đăng bài',
        subjectId,
        files: [
          {
            url: '/api/files/documents/e2e-limit.pdf',
            name: 'e2e-limit.pdf',
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
    const secondUser = await prisma.user.create({
      data: userData('E2E Sinh viên thứ hai', `e2e-settings-user2-${suffix}@example.com`),
      select: { id: true, email: true },
    });

    secondUserId = secondUser.id;
    userIds.push(admin.id, user.id, secondUser.id);

    const subject = await prisma.subject.create({
      data: { code: `SET${suffix}`.slice(0, 20), name: 'Môn E2E cấu hình' },
      select: { id: true },
    });
    subjectId = subject.id;

    adminToken = await login(admin.email);
    userToken = await login(user.email);
    secondUserToken = await login(secondUser.email);

    // Trạng thái đầu của suite: không giới hạn.
    await prisma.systemSetting.upsert({
      where: { key: 'document.dailyLimit' },
      update: { value: 0 },
      create: { key: 'document.dailyLimit', value: 0 },
    });
  });

  afterAll(async () => {
    await prisma.systemSetting.upsert({
      where: { key: 'document.dailyLimit' },
      update: { value: 0 },
      create: { key: 'document.dailyLimit', value: 0 },
    });
    await prisma.expLog.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.document.deleteMany({ where: { authorId: { in: userIds } } });
    await prisma.subject.deleteMany({ where: { id: subjectId } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  it('admin đọc và cập nhật giới hạn; sinh viên bị chặn và giá trị sai bị từ chối', async () => {
    const current = await server()
      .get('/api/admin/settings')
      .set(bearer(adminToken))
      .expect(200);
    expect(typeof (current.body as Envelope<SettingsPayload>).data.documentDailyLimit).toBe(
      'number',
    );

    expect(await setLimit(adminToken, 1)).toEqual(
      expect.objectContaining({ documentDailyLimit: 1 }),
    );

    await server().get('/api/admin/settings').set(bearer(userToken)).expect(403);
    await server()
      .patch('/api/admin/settings')
      .set(bearer(userToken))
      .send({ documentDailyLimit: 5 })
      .expect(403);

    await server()
      .patch('/api/admin/settings')
      .set(bearer(adminToken))
      .send({ documentDailyLimit: 51 })
      .expect(400);
  });

  it('giới hạn 1 bài/ngày: bài thứ hai bị chặn với 429', async () => {
    await setLimit(adminToken, 1);

    expect(await createDocument(userToken, `Bài E2E giới hạn 1 ${suffix}`)).toBe(201);
    expect(await createDocument(userToken, `Bài E2E giới hạn 2 ${suffix}`)).toBe(429);
  });

  it('bài của ngày hôm trước không tính vào giới hạn hôm nay', async () => {
    await setLimit(adminToken, 1);

    await prisma.document.create({
      data: {
        title: `Bài E2E hôm qua ${suffix}`,
        subjectId,
        authorId: secondUserId,
        createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
    });

    expect(await createDocument(secondUserToken, `Bài E2E hôm nay ${suffix}`)).toBe(201);
    expect(await createDocument(secondUserToken, `Bài E2E quá giới hạn ${suffix}`)).toBe(429);
  });

  it('đặt 0 để tắt giới hạn', async () => {
    expect(await setLimit(adminToken, 0)).toEqual(
      expect.objectContaining({ documentDailyLimit: 0 }),
    );

    expect(await createDocument(userToken, `Bài E2E không giới hạn ${suffix}`)).toBe(201);
  });
});
