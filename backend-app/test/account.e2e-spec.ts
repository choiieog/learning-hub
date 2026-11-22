import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { applyAppSettings } from './create-test-app';

interface Envelope<T> {
  success: boolean;
  data: T;
}

interface ErrorBody {
  success: boolean;
  statusCode: number;
  /** ValidationPipe trả mảng câu lỗi, lỗi nghiệp vụ trả một chuỗi. */
  message: string | string[];
}

interface SelfProfile {
  id: string;
  email: string;
  fullName: string;
  bio: string | null;
  avatarUrl: string | null;
  passwordHash?: string;
  refreshTokenHash?: string;
}

interface UploadPayload {
  url: string;
  publicId: string;
  mimeType: string;
}

interface DocumentSummary {
  id: string;
  title: string;
  status: string;
}

interface Paginated<T> {
  items: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

/** PNG tối thiểu: chỉ cần đúng chữ ký nhị phân để qua bước kiểm tra nội dung. */
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

/**
 * E2E thật với Postgres cho tài khoản của chính mình: sửa hồ sơ, upload + gán ảnh
 * đại diện, và danh sách tài liệu đã chia sẻ (/documents/mine).
 */
describe('Tài khoản của tôi (e2e)', () => {
  const suffix = Date.now();
  const password = 'MatKhau123';

  let app: INestApplication;
  let prisma: PrismaService;
  let authorEmail: string;
  let authorToken: string;
  let otherToken: string;
  let pendingId: string;
  let approvedId: string;
  let otherDocId: string;
  const userIds: string[] = [];
  const subjectIds: string[] = [];

  const server = () => request(app.getHttpServer());
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function login(email: string): Promise<string> {
    const response = await server().post('/api/auth/login').send({ email, password }).expect(201);

    return (response.body as Envelope<{ accessToken: string }>).data.accessToken;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    applyAppSettings(app);
    await app.init();

    prisma = app.get(PrismaService);
    authorEmail = `e2e-account-${suffix}@example.com`;

    const passwordHash = await bcrypt.hash(password, 10);
    const author = await prisma.user.create({
      data: {
        email: authorEmail,
        passwordHash,
        fullName: 'E2E Chủ Tài Khoản',
        emailVerifiedAt: new Date(),
      },
    });
    const other = await prisma.user.create({
      data: {
        email: `e2e-account-other-${suffix}@example.com`,
        passwordHash,
        fullName: 'E2E Người Khác',
        emailVerifiedAt: new Date(),
      },
    });

    userIds.push(author.id, other.id);

    const subject = await prisma.subject.create({
      data: { code: `E2E-ACCOUNT-${suffix}`, name: 'Môn tài khoản' },
    });
    subjectIds.push(subject.id);

    const pending = await prisma.document.create({
      data: { title: 'Bài chờ duyệt', subjectId: subject.id, authorId: author.id },
    });
    const approved = await prisma.document.create({
      data: {
        title: 'Bài đã duyệt',
        subjectId: subject.id,
        authorId: author.id,
        status: 'APPROVED',
        publishedAt: new Date(),
      },
    });
    const otherDoc = await prisma.document.create({
      data: { title: 'Bài của người khác', subjectId: subject.id, authorId: other.id },
    });

    pendingId = pending.id;
    approvedId = approved.id;
    otherDocId = otherDoc.id;

    authorToken = await login(author.email);
    otherToken = await login(other.email);
  });

  afterAll(async () => {
    await prisma.uploadedFile.deleteMany({ where: { ownerId: { in: userIds } } });
    await prisma.document.deleteMany({
      where: { id: { in: [pendingId, approvedId, otherDocId] } },
    });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.subject.deleteMany({ where: { id: { in: subjectIds } } });
    await app.close();
  });

  it('sửa hồ sơ: cập nhật họ tên, bio rỗng thành null, chặn họ tên quá ngắn', async () => {
    const updated = await server()
      .patch('/api/users/me')
      .set(bearer(authorToken))
      .send({ fullName: '  E2E Đã Đổi Tên  ', bio: '  Giới thiệu mới  ' })
      .expect(200);

    const profile = (updated.body as Envelope<SelfProfile>).data;
    expect(profile.fullName).toBe('E2E Đã Đổi Tên');
    expect(profile.bio).toBe('Giới thiệu mới');
    expect(profile).not.toHaveProperty('passwordHash');
    expect(profile).not.toHaveProperty('refreshTokenHash');

    const cleared = await server()
      .patch('/api/users/me')
      .set(bearer(authorToken))
      .send({ bio: '   ' })
      .expect(200);
    expect((cleared.body as Envelope<SelfProfile>).data.bio).toBeNull();
    expect((cleared.body as Envelope<SelfProfile>).data.fullName).toBe('E2E Đã Đổi Tên');

    const invalid = await server()
      .patch('/api/users/me')
      .set(bearer(authorToken))
      .send({ fullName: 'A' })
      .expect(400);
    expect([(invalid.body as ErrorBody).message].flat()).toContain(
      'Họ tên phải có ít nhất 2 ký tự',
    );
  });

  it('upload ảnh trong folder avatars rồi gán làm ảnh đại diện', async () => {
    const upload = await server()
      .post('/api/uploads')
      .set(bearer(authorToken))
      .field('folder', 'avatars')
      .attach('file', PNG_BYTES, { filename: 'avatar.png', contentType: 'image/png' })
      .expect(201);

    const file = (upload.body as Envelope<UploadPayload>).data;
    expect(file.url).toMatch(/^\/api\/files\/avatars\//);
    expect(file.mimeType).toBe('image/png');

    const updated = await server()
      .patch('/api/users/me/avatar')
      .set(bearer(authorToken))
      .send({ avatarUrl: file.url })
      .expect(200);
    expect((updated.body as Envelope<SelfProfile>).data.avatarUrl).toBe(file.url);

    const external = await server()
      .patch('/api/users/me/avatar')
      .set(bearer(authorToken))
      .send({ avatarUrl: 'https://example.com/avatar.png' })
      .expect(400);
    expect((external.body as ErrorBody).message).toContain('phải được tải lên qua POST /api/uploads');
  });

  it('chặn file ảnh giả chữ ký khi upload avatar', async () => {
    const response = await server()
      .post('/api/uploads')
      .set(bearer(authorToken))
      .field('folder', 'avatars')
      .attach('file', Buffer.from('không phải ảnh'), {
        filename: 'avatar.png',
        contentType: 'image/png',
      })
      .expect(400);

    expect((response.body as ErrorBody).message).toContain('không phải PNG thật');
  });

  it('/api/documents/mine chỉ trả tài liệu của mình, lọc được theo trạng thái', async () => {
    const mine = await server()
      .get('/api/documents/mine')
      .set(bearer(authorToken))
      .expect(200);

    const body = (mine.body as Envelope<Paginated<DocumentSummary>>).data;
    const ids = body.items.map((item) => item.id);
    expect(body.meta.total).toBe(2);
    expect(ids).toEqual(expect.arrayContaining([pendingId, approvedId]));
    expect(ids).not.toContain(otherDocId);

    const pending = await server()
      .get('/api/documents/mine')
      .query({ status: 'PENDING' })
      .set(bearer(authorToken))
      .expect(200);
    const pendingBody = (pending.body as Envelope<Paginated<DocumentSummary>>).data;
    expect(pendingBody.meta.total).toBe(1);
    expect(pendingBody.items[0].id).toBe(pendingId);

    const otherMine = await server()
      .get('/api/documents/mine')
      .set(bearer(otherToken))
      .expect(200);
    const otherBody = (otherMine.body as Envelope<Paginated<DocumentSummary>>).data;
    expect(otherBody.items.map((item) => item.id)).toEqual([otherDocId]);

    await server().get('/api/documents/mine').expect(401);
  });
});
