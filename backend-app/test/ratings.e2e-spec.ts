import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DocumentStatus } from '../src/generated/prisma/client';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { applyAppSettings } from './create-test-app';

interface Envelope<T> {
  success: boolean;
  data: T;
}

interface RatingItem {
  id: string;
  stars: number;
  comment: string | null;
  user: { id: string; fullName: string };
}

interface RatingListPayload {
  items: RatingItem[];
  meta: { page: number; limit: number; total: number; totalPages: number };
  summary: {
    ratingAvg: number;
    ratingCount: number;
    distribution: Record<string, number>;
  };
  myRating: RatingItem | null;
}

interface UpsertPayload {
  rating: RatingItem;
  ratingAvg: number;
  ratingCount: number;
}

/**
 * E2E thật với Postgres cho đánh giá sao:
 * tạo / cập nhật (unique theo người), cache ratingAvg + ratingCount trên Document,
 * phân bố sao, phân trang, kiểm tra quyền và trạng thái tài liệu.
 */
describe('Đánh giá tài liệu (e2e)', () => {
  const suffix = Date.now();
  const password = 'MatKhau123';

  let app: INestApplication;
  let prisma: PrismaService;
  let subjectId: string;
  let approvedDocId: string;
  let pendingDocId: string;
  let authorToken: string;
  let rater1Token: string;
  let rater2Token: string;

  const userIds: string[] = [];

  const server = () => request(app.getHttpServer());
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const ratingsUrl = (documentId: string) => `/api/documents/${documentId}/ratings`;

  async function login(email: string): Promise<string> {
    const response = await server().post('/api/auth/login').send({ email, password }).expect(201);

    return (response.body as Envelope<{ accessToken: string }>).data.accessToken;
  }

  async function listRatings(
    documentId: string,
    token: string,
    query = '',
  ): Promise<RatingListPayload> {
    const response = await server()
      .get(`${ratingsUrl(documentId)}${query}`)
      .set(bearer(token))
      .expect(200);

    return (response.body as Envelope<RatingListPayload>).data;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    applyAppSettings(app);
    await app.init();

    prisma = app.get(PrismaService);
    const passwordHash = await bcrypt.hash(password, 10);
    const userData = (name: string, email: string) => ({
      email,
      passwordHash,
      fullName: name,
      emailVerifiedAt: new Date(),
    });

    const author = await prisma.user.create({
      data: userData('E2E Tác giả rating', `e2e-rating-author-${suffix}@example.com`),
      select: { id: true, email: true },
    });
    const rater1 = await prisma.user.create({
      data: userData('E2E Người đánh giá 1', `e2e-rating-rater1-${suffix}@example.com`),
      select: { id: true, email: true },
    });
    const rater2 = await prisma.user.create({
      data: userData('E2E Người đánh giá 2', `e2e-rating-rater2-${suffix}@example.com`),
      select: { id: true, email: true },
    });
    userIds.push(author.id, rater1.id, rater2.id);

    const subject = await prisma.subject.create({
      data: { code: `RT${suffix}`.slice(0, 20), name: 'Môn E2E đánh giá' },
      select: { id: true },
    });
    subjectId = subject.id;

    const approved = await prisma.document.create({
      data: {
        title: `Tài liệu E2E rating ${suffix}`,
        subjectId,
        authorId: author.id,
        status: DocumentStatus.APPROVED,
        publishedAt: new Date(),
      },
      select: { id: true },
    });
    approvedDocId = approved.id;

    const pending = await prisma.document.create({
      data: {
        title: `Tài liệu E2E chưa duyệt ${suffix}`,
        subjectId,
        authorId: author.id,
        status: DocumentStatus.PENDING,
      },
      select: { id: true },
    });
    pendingDocId = pending.id;

    authorToken = await login(author.email);
    rater1Token = await login(rater1.email);
    rater2Token = await login(rater2.email);
  });

  afterAll(async () => {
    // Rating cascade theo document; ExpLog thì không cascade theo user.
    await prisma.expLog.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.document.deleteMany({ where: { authorId: { in: userIds } } });
    await prisma.subject.deleteMany({ where: { id: subjectId } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  it('đánh giá 4 sao → lưu nhận xét và cập nhật cache trên tài liệu', async () => {
    const response = await server()
      .post(ratingsUrl(approvedDocId))
      .set(bearer(rater1Token))
      .send({ stars: 4, comment: '  Giải thích dễ hiểu  ' })
      .expect(201);
    const created = (response.body as Envelope<UpsertPayload>).data;

    expect(created.rating.stars).toBe(4);
    expect(created.rating.comment).toBe('Giải thích dễ hiểu');
    expect(created.ratingAvg).toBe(4);
    expect(created.ratingCount).toBe(1);

    const list = await listRatings(approvedDocId, rater2Token);
    expect(list.items).toHaveLength(1);
    expect(list.items[0].user.id).not.toBe('');
    expect(list.summary.distribution['4']).toBe(1);
    expect(list.summary.distribution['5']).toBe(0);
    expect(list.summary.ratingAvg).toBe(4);
    expect(list.myRating).toBeNull();

    const mine = await listRatings(approvedDocId, rater1Token);
    expect(mine.myRating?.stars).toBe(4);

    const detail = await server()
      .get(`/api/documents/${approvedDocId}`)
      .set(bearer(rater1Token))
      .expect(200);
    const document = (detail.body as Envelope<{ ratingAvg: number; ratingCount: number }>).data;
    expect(document.ratingAvg).toBe(4);
    expect(document.ratingCount).toBe(1);
  });

  it('người thứ hai đánh giá và người đầu sửa lại → không tạo thêm lượt, cache là trung bình mới', async () => {
    await server()
      .post(ratingsUrl(approvedDocId))
      .set(bearer(rater2Token))
      .send({ stars: 2 })
      .expect(201);

    const updated = await server()
      .post(ratingsUrl(approvedDocId))
      .set(bearer(rater1Token))
      .send({ stars: 5, comment: 'Hay hơn sau khi đọc kỹ' })
      .expect(201);
    const body = (updated.body as Envelope<UpsertPayload>).data;

    expect(body.ratingCount).toBe(2);
    expect(body.ratingAvg).toBe(3.5);
    expect(body.rating.stars).toBe(5);

    const list = await listRatings(approvedDocId, rater1Token, '?limit=1&page=2');
    expect(list.meta.total).toBe(2);
    expect(list.meta.totalPages).toBe(2);
    expect(list.items).toHaveLength(1);
    expect(list.summary.distribution['2']).toBe(1);
    expect(list.summary.distribution['5']).toBe(1);
  });

  it('chặn dữ liệu sai, tự đánh giá bài mình và tài liệu chưa duyệt', async () => {
    await server()
      .post(ratingsUrl(approvedDocId))
      .set(bearer(rater2Token))
      .send({ stars: 6 })
      .expect(400);

    await server()
      .post(ratingsUrl(approvedDocId))
      .set(bearer(rater2Token))
      .send({ stars: 0 })
      .expect(400);

    await server()
      .post(ratingsUrl(approvedDocId))
      .set(bearer(authorToken))
      .send({ stars: 5 })
      .expect(404);

    await server()
      .post(ratingsUrl(pendingDocId))
      .set(bearer(rater1Token))
      .send({ stars: 5 })
      .expect(404);

    await server().get(ratingsUrl(pendingDocId)).set(bearer(rater1Token)).expect(404);
  });
});
