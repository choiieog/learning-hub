import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { vietnamDayKey } from '../src/common/utils/day-key.util';
import { cutoffBefore } from '../src/common/utils/retention.util';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { applyAppSettings } from './create-test-app';

interface Envelope<T> {
  success: boolean;
  data: T;
}

interface DashboardOverview {
  stats: { viewsLast7Days: number };
  viewTrend: { day: string; count: number }[];
}

/** Cửa sổ biểu đồ của service: 7 ngày gần nhất, tính từ 00:00 ngày cách đây 6 ngày. */
function trendStart(): Date {
  const start = cutoffBefore(6);
  start.setHours(0, 0, 0, 0);

  return start;
}

/**
 * E2E thật với Postgres cho tổng quan sinh viên, tập trung vào cửa sổ 7 ngày:
 * `viewTrend` phải gộp theo ngày và `viewsLast7Days` phải đếm đúng biên — view tạo trước
 * mốc 7 ngày không được lọt vào dù `dayKey` của nó nằm trong danh sách ngày của biểu đồ.
 * (Ngày cũ hơn hẳn thì không cần seed: `viewTrend` chỉ map 7 `trendDays`, nên một `dayKey`
 * ngoài danh sách không thể xuất hiện dù filter `dayKey` có bị bỏ.)
 */
describe('Tổng quan sinh viên (e2e)', () => {
  const suffix = Date.now();
  const password = 'MatKhau123';

  let app: INestApplication;
  let prisma: PrismaService;
  let userId: string;
  let documentId: string;
  let subjectId: string;
  let token: string;

  const server = () => request(app.getHttpServer());

  async function overview(): Promise<DashboardOverview> {
    const response = await server()
      .get('/api/dashboard/overview')
      .set({ Authorization: `Bearer ${token}` })
      .expect(200);

    return (response.body as Envelope<DashboardOverview>).data;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    applyAppSettings(app);
    await app.init();

    prisma = app.get(PrismaService);

    const email = `e2e-dashboard-${suffix}@example.com`;
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(password, 10),
        fullName: 'E2E Tổng Quan',
        emailVerifiedAt: new Date(),
      },
    });
    userId = user.id;

    const subject = await prisma.subject.create({
      data: { code: `E2E-DASH-${suffix}`, name: 'Môn cho tổng quan' },
    });
    subjectId = subject.id;

    const document = await prisma.document.create({
      data: { title: 'Bài của sinh viên', subjectId, authorId: userId },
    });
    documentId = document.id;

    const login = await server()
      .post('/api/auth/login')
      .send({ email, password })
      .expect(201);
    token = (login.body as Envelope<{ accessToken: string }>).data.accessToken;
  });

  afterAll(async () => {
    await prisma.document.deleteMany({ where: { id: documentId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.subject.deleteMany({ where: { id: subjectId } });
    await app.close();
  });

  it('gộp lượt xem hôm nay vào điểm cuối của biểu đồ 7 ngày', async () => {
    const today = vietnamDayKey();
    await prisma.documentView.createMany({
      data: [
        { documentId, viewerKey: `today-a-${suffix}`, dayKey: today },
        { documentId, viewerKey: `today-b-${suffix}`, dayKey: today },
      ],
    });

    const data = await overview();

    expect(data.viewTrend).toHaveLength(7);
    expect(data.viewTrend.at(-1)).toEqual({ day: today, count: 2 });
    expect(data.stats.viewsLast7Days).toBe(2);
  });

  it('loại view tạo trước mốc 7 ngày dù dayKey nằm trong biểu đồ, nhận view đúng mốc', async () => {
    const day = vietnamDayKey(cutoffBefore(6));
    const start = trendStart();

    await prisma.documentView.createMany({
      data: [
        { documentId, viewerKey: `before-${suffix}`, dayKey: day, createdAt: new Date(start.getTime() - 1) },
        { documentId, viewerKey: `at-${suffix}`, dayKey: day, createdAt: start },
      ],
    });

    const data = await overview();

    expect(data.viewTrend[0]).toEqual({ day, count: 1 });
  });
});
