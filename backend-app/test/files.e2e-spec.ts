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

interface UploadPayload {
  publicId: string;
}

interface DocumentPayload {
  id: string;
  files: { url: string }[];
}

const PDF_BYTES = Buffer.from(
  '%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n',
  'latin1',
);

/**
 * E2E cho FilesController:
 * - file tài liệu không cho khách tải;
 * - bài PENDING chỉ tác giả/admin xem được;
 * - bài APPROVED mở cho mọi user đã đăng nhập;
 * - file không tồn tại hoặc path traversal trả 404.
 */
describe('Tệp tài liệu (e2e)', () => {
  const suffix = Date.now();
  const password = 'MatKhau123';

  let app: INestApplication;
  let prisma: PrismaService;
  let subjectId: string;
  let authorToken: string;
  let otherToken: string;
  let adminToken: string;
  let documentId: string;
  let fileUrl: string;

  const userIds: string[] = [];

  const server = () => request(app.getHttpServer());
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function login(email: string): Promise<string> {
    const response = await server().post('/api/auth/login').send({ email, password }).expect(201);

    return (response.body as Envelope<{ accessToken: string }>).data.accessToken;
  }

  async function createDocument(title: string): Promise<DocumentPayload> {
    const upload = await server()
      .post('/api/uploads')
      .set(bearer(authorToken))
      .field('folder', 'documents')
      .attach('file', PDF_BYTES, { filename: 'bai-giang.pdf', contentType: 'application/pdf' })
      .expect(201);
    const file = (upload.body as Envelope<UploadPayload>).data;

    const response = await server()
      .post('/api/documents')
      .set(bearer(authorToken))
      .send({
        title,
        description: 'Bài kiểm thử e2e cho FilesController',
        subjectId,
        files: [{ publicId: file.publicId }],
      })
      .expect(201);

    return (response.body as Envelope<DocumentPayload>).data;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    applyAppSettings(app);
    await app.init();

    prisma = app.get(PrismaService);
    const passwordHash = await bcrypt.hash(password, 10);
    const userData = (fullName: string, email: string, extra: Record<string, unknown> = {}) => ({
      email,
      passwordHash,
      fullName,
      emailVerifiedAt: new Date(),
      ...extra,
    });

    const author = await prisma.user.create({
      data: userData('E2E Tác giả file', `e2e-files-author-${suffix}@example.com`),
      select: { id: true, email: true },
    });
    const other = await prisma.user.create({
      data: userData('E2E Người xem file', `e2e-files-other-${suffix}@example.com`),
      select: { id: true, email: true },
    });
    const admin = await prisma.user.create({
      data: userData('E2E Quản trị file', `e2e-files-admin-${suffix}@example.com`, {
        role: Role.ADMIN,
      }),
      select: { id: true, email: true },
    });

    userIds.push(author.id, other.id, admin.id);

    const subject = await prisma.subject.create({
      data: { code: `FIL${suffix}`.slice(0, 20), name: 'Môn E2E tệp' },
      select: { id: true },
    });
    subjectId = subject.id;

    authorToken = await login(author.email);
    otherToken = await login(other.email);
    adminToken = await login(admin.email);

    const document = await createDocument(`Bài E2E file ${suffix}`);
    documentId = document.id;
    fileUrl = document.files[0].url;
  });

  afterAll(async () => {
    await prisma.expLog.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.document.deleteMany({ where: { authorId: { in: userIds } } });
    await prisma.uploadedFile.deleteMany({ where: { ownerId: { in: userIds } } });
    await prisma.subject.deleteMany({ where: { id: subjectId } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  it('khách không tải được file tài liệu', async () => {
    await server().get(fileUrl).expect(401);
  });

  it('ADMIN tải được tệp PENDING, tài khoản khác nhận 403', async () => {
    const forbidden = await server().get(fileUrl).set(bearer(otherToken)).expect(403);
    expect((forbidden.body as { message: string }).message).toContain('chờ duyệt');

    await server()
      .get(fileUrl)
      .set(bearer(authorToken))
      .expect(200)
      .expect('Content-Type', /application\/pdf/);

    const adminDownload = await server()
      .get(fileUrl)
      .set(bearer(adminToken))
      .expect(200)
      .expect('Content-Type', /application\/pdf/);

    expect(adminDownload.body).toEqual(PDF_BYTES);
  });

  it('bài APPROVED mở cho mọi user đã đăng nhập', async () => {
    await server()
      .patch(`/api/admin/documents/${documentId}/approve`)
      .set(bearer(adminToken))
      .expect(200);

    await server()
      .get(fileUrl)
      .set(bearer(otherToken))
      .expect(200)
      .expect('Content-Type', /application\/pdf/);
  });

  it('file không tồn tại hoặc path traversal trả 404', async () => {
    await server()
      .get('/api/files/documents/not-a-real-file.pdf')
      .set(bearer(authorToken))
      .expect(404);

    await server()
      .get('/api/files/documents/..%2F..%2Fpackage.json')
      .set(bearer(authorToken))
      .expect(404);
  });
});
