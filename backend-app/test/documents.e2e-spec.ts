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

interface DocumentPayload {
  id: string;
  title: string;
  status: string;
  viewCount: number;
  viewCountedToday: boolean;
  files?: { publicId: string | null }[];
}

interface UploadPayload {
  url: string;
  /** Khoá trên storage — phải được gửi lại khi tạo tài liệu. */
  publicId: string;
  name: string;
  size: number;
  mimeType: string;
}

const PDF_BYTES = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n', 'latin1');

/**
 * E2E thật với Postgres cho tài liệu:
 * upload + kiểm chữ ký file, đăng bài vào PENDING, ẩn với người khác, đếm lượt xem
 * 1 lần/người/ngày, từ chối → xoá hẳn, xoá cứng (cascade dọn rating).
 */
describe('Tài liệu (e2e)', () => {
  const suffix = Date.now();
  const password = 'MatKhau123';

  let app: INestApplication;
  let prisma: PrismaService;
  let subjectId: string;
  let authorToken: string;
  let otherToken: string;
  let otherId: string;
  let adminToken: string;
  let uploadedPdf: UploadPayload;
  let pendingDocId: string;
  let pendingDocTitle: string;

  const userIds: string[] = [];

  const server = () => request(app.getHttpServer());
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function login(email: string): Promise<string> {
    const response = await server().post('/api/auth/login').send({ email, password }).expect(201);

    return (response.body as Envelope<{ accessToken: string }>).data.accessToken;
  }

  async function createDocument(title: string): Promise<DocumentPayload> {
    // Mỗi tài liệu cần một file mới: một file chỉ được gắn cho đúng một tài liệu
    // (UploadedFile.documentId), nên upload lại thay vì dùng lại uploadedPdf.
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
        description: 'Bài kiểm thử e2e',
        subjectId,
        files: [
          {
            publicId: file.publicId,
            url: file.url,
            name: file.name,
            size: file.size,
            mimeType: file.mimeType,
          },
        ],
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

    const author = await prisma.user.create({
      data: {
        email: `e2e-docs-author-${suffix}@example.com`,
        passwordHash,
        fullName: 'E2E Tác giả tài liệu',
        emailVerifiedAt: new Date(),
      },
      select: { id: true, email: true },
    });
    const other = await prisma.user.create({
      data: {
        email: `e2e-docs-other-${suffix}@example.com`,
        passwordHash,
        fullName: 'E2E Sinh viên khác',
        emailVerifiedAt: new Date(),
      },
      select: { id: true, email: true },
    });
    const admin = await prisma.user.create({
      data: {
        email: `e2e-docs-admin-${suffix}@example.com`,
        passwordHash,
        fullName: 'E2E Quản trị tài liệu',
        role: Role.ADMIN,
        emailVerifiedAt: new Date(),
      },
      select: { id: true, email: true },
    });

    otherId = other.id;
    userIds.push(author.id, other.id, admin.id);

    const subject = await prisma.subject.create({
      data: { code: `DOC${suffix}`.slice(0, 20), name: 'Môn E2E tài liệu' },
      select: { id: true },
    });
    subjectId = subject.id;

    authorToken = await login(author.email);
    otherToken = await login(other.email);
    adminToken = await login(admin.email);

    // PDF tối thiểu nhưng có đúng chữ ký %PDF để qua bước kiểm magic bytes.
    const uploadResponse = await server()
      .post('/api/uploads')
      .set(bearer(authorToken))
      .field('folder', 'documents')
      .attach('file', PDF_BYTES, { filename: 'bai-giang.pdf', contentType: 'application/pdf' })
      .expect(201);

    uploadedPdf = (uploadResponse.body as Envelope<UploadPayload>).data;
  });

  afterAll(async () => {
    // ExpLog không cascade theo user — xoá trước khi xoá tài khoản.
    await prisma.expLog.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.document.deleteMany({ where: { authorId: { in: userIds } } });
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.subject.deleteMany({ where: { id: subjectId } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  it('tải file thật rồi đăng bài → PENDING và người khác không thấy', async () => {
    expect(uploadedPdf.url).toContain('/api/files/documents/');

    pendingDocTitle = `Tài liệu E2E ${suffix}`;
    const document = await createDocument(pendingDocTitle);
    pendingDocId = document.id;

    expect(document.status).toBe('PENDING');

    await server().get(`/api/documents/${document.id}`).set(bearer(otherToken)).expect(404);

    const list = await server()
      .get('/api/documents')
      .query({ keyword: pendingDocTitle })
      .set(bearer(otherToken))
      .expect(200);
    const body = list.body as Envelope<{ items: { id: string }[]; meta: { total: number } }>;

    expect(body.data.meta.total).toBe(0);
  });

  it('duyệt xong mới hiện công khai, mỗi người chỉ tính 1 lượt xem/ngày', async () => {
    const approved = await server()
      .patch(`/api/admin/documents/${pendingDocId}/approve`)
      .set(bearer(adminToken))
      .expect(200);
    expect((approved.body as Envelope<DocumentPayload>).data.status).toBe('APPROVED');

    const list = await server()
      .get('/api/documents')
      .query({ keyword: pendingDocTitle })
      .set(bearer(otherToken))
      .expect(200);
    const listBody = list.body as Envelope<{ items: { id: string }[]; meta: { total: number } }>;
    expect(listBody.data.items.map((item) => item.id)).toContain(pendingDocId);

    const firstView = await server()
      .get(`/api/documents/${pendingDocId}`)
      .set(bearer(otherToken))
      .expect(200);
    const first = (firstView.body as Envelope<DocumentPayload>).data;
    expect(first.viewCount).toBe(1);
    expect(first.viewCountedToday).toBe(true);

    const secondView = await server()
      .get(`/api/documents/${pendingDocId}`)
      .set(bearer(otherToken))
      .expect(200);
    const second = (secondView.body as Envelope<DocumentPayload>).data;
    expect(second.viewCount).toBe(1);
    expect(second.viewCountedToday).toBe(false);
  });

  it('từ chối → xoá hẳn tài liệu kèm file, tác giả nhận lý do', async () => {
    const document = await createDocument(`Bài E2E bị từ chối ${suffix}`);
    const publicId = document.files?.[0]?.publicId ?? '';

    await server()
      .patch(`/api/admin/documents/${document.id}/reject`)
      .set(bearer(adminToken))
      .send({ reason: 'Cần bổ sung nguồn tham khảo' })
      .expect(200);

    // Xoá cứng: bài không còn để mở, file đính kèm và row UploadedFile cũng bị dọn.
    await server()
      .get(`/api/documents/${document.id}`)
      .set(bearer(authorToken))
      .expect(404);
    expect(await prisma.document.findUnique({ where: { id: document.id } })).toBeNull();
    expect(await prisma.documentFile.count({ where: { documentId: document.id } })).toBe(0);
    expect(await prisma.uploadedFile.findUnique({ where: { publicId } })).toBeNull();

    // Lý do từ chối vẫn được gửi cho tác giả, nhưng không kèm link vì bài đã bị xoá.
    const rejected = await prisma.notification.findFirst({
      where: { type: 'DOCUMENT_REJECTED', message: { contains: document.title } },
      select: { message: true, link: true },
    });
    expect(rejected?.message).toContain('Cần bổ sung nguồn tham khảo');
    expect(rejected?.link).toBeNull();
  });

  it('không còn endpoint sửa & gửi duyệt lại', async () => {
    const document = await createDocument(`Bài E2E không còn resubmit ${suffix}`);

    // Luồng "Sửa & gửi lại" đã bị bỏ cùng trạng thái REJECTED: PATCH /documents/:id không còn route.
    await server()
      .patch(`/api/documents/${document.id}`)
      .set(bearer(authorToken))
      .send({ title: `Bài E2E đã sửa ${suffix}`, subjectId })
      .expect(404);
  });

  it('chủ bài tự xoá → xoá hẳn bài, file và rating', async () => {
    const document = await createDocument(`Bài E2E tự xoá ${suffix}`);

    // Người khác không xoá được bài của tác giả.
    await server().delete(`/api/documents/${document.id}`).set(bearer(otherToken)).expect(403);

    // Có rating trước khi xoá để kiểm cascade dọn luôn đánh giá/bình luận.
    await prisma.rating.create({
      data: { documentId: document.id, userId: otherId, stars: 4, comment: 'Kiểm tra xoá' },
    });

    await server().delete(`/api/documents/${document.id}`).set(bearer(authorToken)).expect(200);
    await server().get(`/api/documents/${document.id}`).set(bearer(authorToken)).expect(404);

    // Xoá cứng: không còn row Document, DocumentFile hay Rating nào của bài.
    expect(await prisma.document.findUnique({ where: { id: document.id } })).toBeNull();
    expect(await prisma.documentFile.count({ where: { documentId: document.id } })).toBe(0);
    expect(await prisma.rating.count({ where: { documentId: document.id } })).toBe(0);
  });

  it('chặn file giả: nội dung sai chữ ký hoặc MIME không khớp đuôi', async () => {
    const fakeContent = await server()
      .post('/api/uploads')
      .set(bearer(authorToken))
      .attach('file', Buffer.from('day khong phai file pdf'), {
        filename: 'gia-mao.pdf',
        contentType: 'application/pdf',
      })
      .expect(400);
    expect((fakeContent.body as { message: string }).message).toContain('không phải PDF');

    const wrongMime = await server()
      .post('/api/uploads')
      .set(bearer(authorToken))
      .attach('file', PDF_BYTES, { filename: 'bai-giang.pdf', contentType: 'text/plain' })
      .expect(400);
    expect((wrongMime.body as { message: string }).message).toContain('không khớp định dạng');
  });
});
