import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import bcrypt from 'bcryptjs';
import { createHash } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { MailService } from '../src/infra/mail/mail.service';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { applyAppSettings } from './create-test-app';

interface SentMail {
  to: string;
  fullName: string;
  token: string;
}

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

interface ErrorBody {
  success: boolean;
  statusCode: number;
  message: string;
  code?: string;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Refresh token chỉ nằm trong cookie HttpOnly, không có trong body. */
function refreshCookies(setCookie: unknown): string[] {
  return ((setCookie ?? []) as string[]).filter((cookie) =>
    cookie.startsWith('lh_refresh='),
  );
}

/** Giá trị token trong `Set-Cookie`, bỏ attribute như Path/Expires/HttpOnly. */
function refreshTokenOf(cookie: string): string {
  return cookie.split(';', 1)[0].replace('lh_refresh=', '');
}

/**
 * E2E thật với Postgres: cần `DATABASE_URL` trỏ tới DB đã chạy `prisma migrate deploy`.
 * MailService được thay bằng mock để lấy token gốc trong link (chỉ có trong email);
 * auth, prisma, guard, filter, interceptor và cookie đều là code thật.
 *
 * Số request có rate limit được giữ dưới ngưỡng mặc định: register 5/giờ,
 * resend-verification 3/15 phút, login 10/5 phút.
 */
describe('Luồng xác thực tài khoản (e2e)', () => {
  const password = 'MatKhauDangKy123';
  const fullName = 'E2E Đăng Ký';
  const sentMails: SentMail[] = [];

  let app: INestApplication;
  let prisma: PrismaService;
  let email: string;
  let userId: string;
  let verificationToken = '';
  let refreshCookie = '';

  const sendVerificationEmail = jest.fn<(params: SentMail) => Promise<void>>(
    async (params) => {
      sentMails.push(params);
    },
  );

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService)
      .useValue({
        sendVerificationEmail,
        sendPasswordResetEmail: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      })
      .compile();

    app = moduleRef.createNestApplication();
    applyAppSettings(app);
    await app.init();

    prisma = app.get(PrismaService);
    email = `e2e-auth-${Date.now()}@example.com`;
  });

  afterAll(async () => {
    // Token xác thực cascade theo user; xoá theo email để không phụ thuộc userId.
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  it('register tạo tài khoản chưa xác thực, gửi link và chỉ lưu hash token', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password, fullName })
      .expect(201);

    const body = response.body as ApiEnvelope<{ message: string }>;
    expect(body.data.message).toContain('Đăng ký thành công');

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    userId = user.id;
    expect(user.emailVerifiedAt).toBeNull();
    expect(await bcrypt.compare(password, user.passwordHash)).toBe(true);

    expect(sendVerificationEmail).toHaveBeenCalledTimes(1);
    const sent = sentMails[0];
    expect(sent.to).toBe(email);
    expect(sent.token).toMatch(/^[a-f0-9]{64}$/);

    // DB chỉ có sha256 của token, không có token gốc trong mail.
    const stored = await prisma.emailVerificationToken.findUnique({
      where: { tokenHash: sha256(sent.token) },
    });
    expect(stored?.usedAt).toBeNull();
    expect(stored?.expiresAt.getTime()).toBeGreaterThan(Date.now() + 23 * 60 * 60 * 1000);
    expect(
      await prisma.emailVerificationToken.findUnique({ where: { tokenHash: sent.token } }),
    ).toBeNull();

    verificationToken = sent.token;
  });

  it('email đã đăng ký không đăng ký được lần hai', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password, fullName })
      .expect(409);

    expect((response.body as ErrorBody).message).toContain('đã được đăng ký');
    expect(sendVerificationEmail).toHaveBeenCalledTimes(1);
  });

  it('chặn đăng nhập khi email chưa xác thực', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(403);

    const body = response.body as ErrorBody;
    expect(body.code).toBe('EMAIL_NOT_VERIFIED');
    expect(body.message).toContain('chưa xác thực email');
  });

  it('resend-verification chặn gửi lại trong cooldown và không lộ email tồn tại', async () => {
    const tooSoon = await request(app.getHttpServer())
      .post('/api/auth/resend-verification')
      .send({ email })
      .expect(429);
    expect((tooSoon.body as ErrorBody).message).toContain('vừa yêu cầu gửi lại');

    const unknown = await request(app.getHttpServer())
      .post('/api/auth/resend-verification')
      .send({ email: 'khong-ton-tai-e2e@example.com' })
      .expect(201);
    expect((unknown.body as ApiEnvelope<{ message: string }>).data.message).toContain(
      'Nếu email này chưa được xác thực',
    );
    expect(sendVerificationEmail).toHaveBeenCalledTimes(1);
  });

  it('sau cooldown, resend-verification gửi link mới và lưu hash của link đó', async () => {
    await prisma.emailVerificationToken.updateMany({
      where: { userId },
      data: { createdAt: new Date(Date.now() - 10 * 60 * 1000) },
    });

    const response = await request(app.getHttpServer())
      .post('/api/auth/resend-verification')
      .send({ email })
      .expect(201);
    expect((response.body as ApiEnvelope<{ message: string }>).data.message).toContain(
      'Nếu email này chưa được xác thực',
    );

    expect(sendVerificationEmail).toHaveBeenCalledTimes(2);
    const resent = sentMails[1];
    expect(resent.token).not.toBe(verificationToken);
    expect(
      await prisma.emailVerificationToken.findUnique({
        where: { tokenHash: sha256(resent.token) },
      }),
    ).not.toBeNull();

    verificationToken = resent.token;
  });

  it('verify-email kích hoạt tài khoản và token chỉ dùng một lần', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/verify-email')
      .send({ token: verificationToken })
      .expect(201);
    expect((response.body as ApiEnvelope<{ message: string }>).data.message).toContain(
      'Xác thực email thành công',
    );

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.emailVerifiedAt).not.toBeNull();

    const used = await prisma.emailVerificationToken.findUnique({
      where: { tokenHash: sha256(verificationToken) },
    });
    expect(used?.usedAt).not.toBeNull();

    const reused = await request(app.getHttpServer())
      .post('/api/auth/verify-email')
      .send({ token: verificationToken })
      .expect(400);
    expect((reused.body as ErrorBody).message).toContain('không hợp lệ hoặc đã hết hạn');
  });

  it('login sau xác thực trả access token + cookie refresh, không lộ refresh token', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(201);

    const body = response.body as ApiEnvelope<{
      accessToken: string;
      user: { email: string; emailVerifiedAt: string | null };
    }>;
    expect(body.data.accessToken).toEqual(expect.any(String));
    expect(body.data.user.email).toBe(email);
    expect(body.data.user.emailVerifiedAt).not.toBeNull();
    expect(body.data).not.toHaveProperty('refreshToken');
    expect(body.data.user).not.toHaveProperty('passwordHash');

    const cookies = refreshCookies(response.headers['set-cookie']);
    expect(cookies).toHaveLength(1);
    refreshCookie = cookies[0];
    expect(refreshCookie).toMatch(/HttpOnly/i);
  });

  it('refresh xoay token và cấp access token dùng được, login lần nữa thu hồi phiên cũ', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', refreshCookie)
      .expect(201);

    const body = response.body as ApiEnvelope<{ accessToken: string }>;
    await request(app.getHttpServer())
      .get('/api/users/me')
      .set('Authorization', `Bearer ${body.data.accessToken}`)
      .expect(200);

    const missing = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({})
      .expect(401);
    expect((missing.body as ErrorBody).message).toContain('Thiếu refresh token');

    // Cookie hiện tại của phiên vừa refresh (token được xoay mỗi lần).
    const rotated = refreshCookies(response.headers['set-cookie']);
    expect(rotated).toHaveLength(1);
    expect(refreshTokenOf(rotated[0])).not.toBe(refreshTokenOf(refreshCookie));

    // Phiên thứ hai: hash mới ghi đè hash cũ ⇒ cookie của phiên đầu mất hiệu lực.
    const secondLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(201);
    const secondCookies = refreshCookies(secondLogin.headers['set-cookie']);
    expect(secondCookies).toHaveLength(1);
    refreshCookie = secondCookies[0];

    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', rotated[0])
      .expect(401);
  });

  it('logout thu hồi phiên hiện tại và xoá cookie', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Cookie', refreshCookie)
      .expect(201);
    expect((response.body as ApiEnvelope<{ message: string }>).data.message).toContain(
      'Đã đăng xuất',
    );

    const cleared = refreshCookies(response.headers['set-cookie']);
    expect(cleared).toHaveLength(1);
    expect(cleared[0]).toMatch(/lh_refresh=;.*Expires=Thu, 01 Jan 1970/);

    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', refreshCookie)
      .expect(401);
  });
});
