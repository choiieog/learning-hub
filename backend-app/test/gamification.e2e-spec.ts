import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DocumentStatus, Role } from '../src/generated/prisma/client';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { applyAppSettings } from './create-test-app';

interface Envelope<T> {
  success: boolean;
  data: T;
}

interface LeaderboardEntry {
  rank: number;
  id: string;
  fullName: string;
  level: number;
  exp: number;
  levelExp: number;
  levelStep: number;
  remaining: number;
  progressPercent: number;
}

interface LeaderboardResponse {
  items: LeaderboardEntry[];
  total: number;
  me: LeaderboardEntry | null;
}

/**
 * E2E thật với Postgres cho gamification:
 * EXP khi có lượt xem hợp lệ, khi nhận đánh giá mới, khi bài được duyệt; level suy ra
 * từ tổng EXP; bảng xếp hạng trả thứ hạng + tiến độ của người gọi.
 */
describe('Gamification (e2e)', () => {
  const suffix = Date.now();
  const password = 'MatKhau123';

  let app: INestApplication;
  let prisma: PrismaService;
  let subjectId: string;
  let approvedDocId: string;
  let levelerDocId: string;
  let pendingDocId: string;
  let viewerToken: string;
  let authorToken: string;
  let adminToken: string;

  let authorId: string;
  let viewerId: string;
  let levelerId: string;
  let adminId: string;

  const userIds: string[] = [];

  const server = () => request(app.getHttpServer());
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function login(email: string): Promise<string> {
    const response = await server().post('/api/auth/login').send({ email, password }).expect(201);

    return (response.body as Envelope<{ accessToken: string }>).data.accessToken;
  }

  async function userExp(id: string): Promise<{ exp: number; level: number }> {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id },
      select: { exp: true, level: true },
    });

    return user;
  }

  async function leaderboard(token: string, query = ''): Promise<LeaderboardResponse> {
    const response = await server()
      .get(`/api/leaderboard${query}`)
      .set(bearer(token))
      .expect(200);

    return (response.body as Envelope<LeaderboardResponse>).data;
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

    const author = await prisma.user.create({
      data: userData('E2E Tác giả EXP', `e2e-exp-author-${suffix}@example.com`),
      select: { id: true, email: true },
    });
    const viewer = await prisma.user.create({
      data: userData('E2E Người xem', `e2e-exp-viewer-${suffix}@example.com`),
      select: { id: true, email: true },
    });
    // Sát mốc level 2 (cần 100 EXP): một lượt xem nữa là lên cấp.
    const leveler = await prisma.user.create({
      data: userData('E2E Sắp lên cấp', `e2e-exp-leveler-${suffix}@example.com`, { exp: 99 }),
      select: { id: true, email: true },
    });
    const admin = await prisma.user.create({
      data: userData('E2E Quản trị EXP', `e2e-exp-admin-${suffix}@example.com`, {
        role: Role.ADMIN,
      }),
      select: { id: true, email: true },
    });

    authorId = author.id;
    viewerId = viewer.id;
    levelerId = leveler.id;
    adminId = admin.id;
    userIds.push(author.id, viewer.id, leveler.id, admin.id);

    const subject = await prisma.subject.create({
      data: { code: `EXP${suffix}`.slice(0, 20), name: 'Môn E2E gamification' },
      select: { id: true },
    });
    subjectId = subject.id;

    const approved = await prisma.document.create({
      data: {
        title: `Tài liệu E2E EXP ${suffix}`,
        subjectId,
        authorId,
        status: DocumentStatus.APPROVED,
        publishedAt: new Date(),
      },
      select: { id: true },
    });
    approvedDocId = approved.id;

    const levelerDoc = await prisma.document.create({
      data: {
        title: `Tài liệu E2E sắp lên cấp ${suffix}`,
        subjectId,
        authorId: leveler.id,
        status: DocumentStatus.APPROVED,
        publishedAt: new Date(),
      },
      select: { id: true },
    });
    levelerDocId = levelerDoc.id;

    const pending = await prisma.document.create({
      data: {
        title: `Tài liệu E2E chờ duyệt ${suffix}`,
        subjectId,
        authorId,
        status: DocumentStatus.PENDING,
      },
      select: { id: true },
    });
    pendingDocId = pending.id;

    viewerToken = await login(viewer.email);
    authorToken = await login(author.email);
    adminToken = await login(admin.email);
  });

  afterAll(async () => {
    // ExpLog và Notification không cascade theo user.
    await prisma.expLog.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.document.deleteMany({ where: { authorId: { in: userIds } } });
    await prisma.subject.deleteMany({ where: { id: subjectId } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  it('lượt xem hợp lệ cộng EXP, xem lại trong ngày và tự xem bài mình không cộng', async () => {
    await server().get(`/api/documents/${approvedDocId}`).set(bearer(viewerToken)).expect(200);

    expect(await userExp(authorId)).toEqual({ exp: 1, level: 1 });
    expect(
      await prisma.expLog.count({
        where: { userId: authorId, reason: 'VIEW', refId: approvedDocId },
      }),
    ).toBe(1);

    // Cùng ngày, cùng người xem → không tính thêm lượt.
    await server().get(`/api/documents/${approvedDocId}`).set(bearer(viewerToken)).expect(200);
    expect((await userExp(authorId)).exp).toBe(1);

    // Tác giả tự xem bài mình: có lượt xem nhưng không cộng EXP.
    await server().get(`/api/documents/${approvedDocId}`).set(bearer(authorToken)).expect(200);
    expect((await userExp(authorId)).exp).toBe(1);

    // Người sắp lên cấp: 99 + 1 = 100 → level 2.
    await server().get(`/api/documents/${levelerDocId}`).set(bearer(viewerToken)).expect(200);
    expect(await userExp(levelerId)).toEqual({ exp: 100, level: 2 });
  });

  it('đánh giá mới cộng 5 EXP, sửa lại đánh giá cũ không cộng thêm', async () => {
    await server()
      .post(`/api/documents/${approvedDocId}/ratings`)
      .set(bearer(viewerToken))
      .send({ stars: 5, comment: 'Tài liệu rất hữu ích' })
      .expect(201);

    expect((await userExp(authorId)).exp).toBe(6);

    await server()
      .post(`/api/documents/${approvedDocId}/ratings`)
      .set(bearer(viewerToken))
      .send({ stars: 4 })
      .expect(201);

    expect((await userExp(authorId)).exp).toBe(6);
    expect(
      await prisma.expLog.count({ where: { userId: authorId, reason: 'RATING' } }),
    ).toBe(1);
  });

  it('duyệt bài cộng 20 EXP và bảng xếp hạng trả thứ hạng + tiến độ', async () => {
    await server()
      .patch(`/api/admin/documents/${pendingDocId}/approve`)
      .set(bearer(adminToken))
      .expect(200);

    expect((await userExp(authorId)).exp).toBe(26);

    const board = await leaderboard(viewerToken, '?limit=10');

    // Admin không nằm trong bảng; DB dev còn tài khoản seed nên chỉ kiểm tương đối.
    expect(board.items.map((item) => item.id)).not.toContain(adminId);
    expect(board.total).toBeGreaterThanOrEqual(3);

    const first = board.items[0];
    expect(first.id).toBe(levelerId);
    expect(first.rank).toBe(1);
    expect(first.level).toBe(2);
    expect(first.exp).toBe(100);

    const second = board.items[1];
    expect(second.id).toBe(authorId);
    expect(second.rank).toBe(2);
    expect(second.level).toBe(1);
    expect(second.exp).toBe(26);
    expect(second.levelStep).toBe(100);
    expect(second.remaining).toBe(74);
    expect(second.progressPercent).toBe(26);

    expect(board.me?.id).toBe(viewerId);
    expect(board.me?.rank).toBeGreaterThanOrEqual(3);
    expect(board.me?.exp).toBe(0);
    expect(board.me?.level).toBe(1);

    await server().get('/api/leaderboard?limit=0').set(bearer(viewerToken)).expect(400);
  });
});
