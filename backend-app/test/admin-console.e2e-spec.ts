import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DEFAULT_PAGE_SIZE } from '../src/common/dto/pagination-query.dto';
import { vietnamDayKey } from '../src/common/utils/day-key.util';
import { cutoffBefore } from '../src/common/utils/retention.util';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { applyAppSettings } from './create-test-app';

interface Envelope<T> {
  success: boolean;
  data: T;
}

interface AdminUserSummary {
  id: string;
  email: string;
  fullName: string;
  role: string;
  status: string;
  warningCount: number;
  documentCount: number;
  passwordHash?: string;
}

interface AdminUserDetail extends AdminUserSummary {
  warnings: { reason: string; admin: { id: string; fullName: string } }[];
}

interface Paginated<T> {
  items: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

interface AdminOverview {
  users: { total: number; newIn7Days: number; warned: number; banned: number };
  documents: { total: number; pending: number; approved: number };
  views: { total: number; in7Days: number };
  topDocuments: { id: string; title: string; viewCount: number }[];
  recentActivity: { type: 'DOCUMENT' | 'WARNING'; message: string }[];
}

/**
 * E2E thật với Postgres cho console quản trị: danh sách tài khoản (tìm kiếm, lọc),
 * chi tiết kèm lịch sử cảnh báo, và số liệu trang tổng quan. Mọi số đếm dùng ngưỡng
 * dưới vì DB có thể còn dữ liệu của suite khác.
 */
describe('Console quản trị (e2e)', () => {
  const suffix = Date.now();
  const password = 'MatKhau123';

  let app: INestApplication;
  let prisma: PrismaService;
  let adminId: string;
  let studentId: string;
  let studentEmail: string;
  let adminToken: string;
  let studentToken: string;
  let documentId: string;
  const userIds: string[] = [];
  const createdSubjectIds: string[] = [];

  const server = () => request(app.getHttpServer());
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function login(email: string): Promise<string> {
    const response = await server().post('/api/auth/login').send({ email, password }).expect(201);

    return (response.body as Envelope<{ accessToken: string }>).data.accessToken;
  }

  async function loadOverview(): Promise<AdminOverview> {
    const response = await server()
      .get('/api/admin/dashboard/overview')
      .set(bearer(adminToken))
      .expect(200);

    return (response.body as Envelope<AdminOverview>).data;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    applyAppSettings(app);
    await app.init();

    prisma = app.get(PrismaService);
    studentEmail = `e2e-admin-student-${suffix}@example.com`;

    const passwordHash = await bcrypt.hash(password, 10);
    const admin = await prisma.user.create({
      data: {
        email: `e2e-admin-${suffix}@example.com`,
        passwordHash,
        fullName: 'E2E Quản Trị',
        role: 'ADMIN',
        emailVerifiedAt: new Date(),
      },
    });
    const student = await prisma.user.create({
      data: {
        email: studentEmail,
        passwordHash,
        fullName: 'E2E Sinh Viên',
        emailVerifiedAt: new Date(),
      },
    });
    // Tài khoản thứ hai cùng role/status: nếu bỏ lọc keyword thì nó cũng lọt vào kết quả.
    const decoy = await prisma.user.create({
      data: {
        email: `e2e-admin-decoy-${suffix}@example.com`,
        passwordHash,
        fullName: 'E2E Người Ngoài',
        emailVerifiedAt: new Date(),
      },
    });

    adminId = admin.id;
    studentId = student.id;
    userIds.push(admin.id, student.id, decoy.id);

    const subject = await prisma.subject.create({
      data: { code: `E2E-ADMIN-${suffix}`, name: 'Môn cho console' },
    });
    createdSubjectIds.push(subject.id);

    const document = await prisma.document.create({
      data: { title: 'Bài chờ duyệt của sinh viên', subjectId: subject.id, authorId: student.id },
    });
    documentId = document.id;

    adminToken = await login(admin.email);
    studentToken = await login(student.email);
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { userId: studentId } });
    await prisma.userWarning.deleteMany({ where: { userId: studentId } });
    await prisma.document.deleteMany({ where: { id: documentId } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.subject.deleteMany({ where: { id: { in: createdSubjectIds } } });
    await app.close();
  });

  it('lọc danh sách tài khoản theo từ khoá, role và trạng thái', async () => {
    const response = await server()
      .get('/api/admin/users')
      .query({ keyword: studentEmail, role: 'USER', status: 'ACTIVE' })
      .set(bearer(adminToken))
      .expect(200);

    const body = (response.body as Envelope<Paginated<AdminUserSummary>>).data;
    expect(body.meta).toEqual({ page: 1, limit: DEFAULT_PAGE_SIZE, total: 1, totalPages: 1 });

    const [student] = body.items;
    expect(student.id).toBe(studentId);
    expect(student.documentCount).toBe(1);
    expect(student).not.toHaveProperty('passwordHash');
  });

  it('chi tiết tài khoản kèm lịch sử cảnh báo, 404 khi không tồn tại', async () => {
    await server()
      .post(`/api/admin/users/${studentId}/warnings`)
      .set(bearer(adminToken))
      .send({ reason: 'Đăng tài liệu sai môn' })
      .expect(201);

    const response = await server()
      .get(`/api/admin/users/${studentId}`)
      .set(bearer(adminToken))
      .expect(200);

    const detail = (response.body as Envelope<AdminUserDetail>).data;
    expect(detail.id).toBe(studentId);
    expect(detail.warningCount).toBe(1);
    expect(detail.warnings).toHaveLength(1);
    expect(detail.warnings[0].reason).toBe('Đăng tài liệu sai môn');
    expect(detail.warnings[0].admin.id).toBe(adminId);

    const warned = await server()
      .get('/api/admin/users')
      .query({ keyword: studentEmail, warnedOnly: 'true' })
      .set(bearer(adminToken))
      .expect(200);
    expect((warned.body as Envelope<Paginated<AdminUserSummary>>).data.items).toHaveLength(1);

    await server()
      .get('/api/admin/users/00000000-0000-0000-0000-000000000000')
      .set(bearer(adminToken))
      .expect(404);
  });

  it('chỉ ADMIN vào được console quản trị', async () => {
    await server().get('/api/admin/users').set(bearer(studentToken)).expect(403);
    await server().get('/api/admin/dashboard/overview').set(bearer(studentToken)).expect(403);
    await server().get('/api/admin/users').expect(401);
  });

  it('overview trả số liệu và hoạt động gần đây', async () => {
    const overview = await loadOverview();

    expect(overview.users).toEqual({
      total: expect.any(Number),
      newIn7Days: expect.any(Number),
      warned: expect.any(Number),
      banned: expect.any(Number),
    });
    expect(overview.users.total).toBeGreaterThanOrEqual(3);
    expect(overview.users.warned).toBeGreaterThanOrEqual(1);
    expect(overview.views).toEqual({ total: expect.any(Number), in7Days: expect.any(Number) });
    expect(overview.documents.pending).toBeGreaterThanOrEqual(1);
    expect(overview.documents.total).toBeGreaterThanOrEqual(
      overview.documents.pending + overview.documents.approved,
    );
    expect(Array.isArray(overview.topDocuments)).toBe(true);
    expect(
      overview.recentActivity.some((activity) => activity.type === 'WARNING'),
    ).toBe(true);
    expect(
      overview.recentActivity.some((activity) => activity.type === 'DOCUMENT'),
    ).toBe(true);
  });

  it('cửa sổ 7 ngày của user: tài khoản cũ hơn 7 ngày không vào newIn7Days', async () => {
    const before = await loadOverview();

    const oldUser = await prisma.user.create({
      data: {
        email: `e2e-admin-old-${suffix}@example.com`,
        passwordHash: 'x',
        fullName: 'E2E Tài Khoản Cũ',
        emailVerifiedAt: new Date(),
        createdAt: cutoffBefore(7.5),
      },
    });
    const freshUser = await prisma.user.create({
      data: {
        email: `e2e-admin-fresh-${suffix}@example.com`,
        passwordHash: 'x',
        fullName: 'E2E Tài Khoản Mới',
        emailVerifiedAt: new Date(),
        createdAt: cutoffBefore(6),
      },
    });
    userIds.push(oldUser.id, freshUser.id);

    // 7.5 ngày phải ngoài cửa sổ, 6 ngày phải trong: nếu cutoff lùi quá 7 ngày thì cả hai lọt.
    const after = await loadOverview();
    expect(after.users.newIn7Days).toBe(before.users.newIn7Days + 1);
  });

  it('cửa sổ 7 ngày của view: view cũ hơn 7 ngày không vào in7Days', async () => {
    const before = await loadOverview();

    await prisma.documentView.create({
      data: {
        documentId,
        viewerKey: `old-view-${suffix}`,
        dayKey: vietnamDayKey(),
        createdAt: cutoffBefore(7.5),
      },
    });
    const afterOldView = await loadOverview();
    expect(afterOldView.views.in7Days).toBe(before.views.in7Days);

    await prisma.documentView.create({
      data: {
        documentId,
        viewerKey: `fresh-view-${suffix}`,
        dayKey: vietnamDayKey(),
        createdAt: new Date(),
      },
    });
    const afterFreshView = await loadOverview();
    expect(afterFreshView.views.in7Days).toBe(afterOldView.views.in7Days + 1);
  });
});
