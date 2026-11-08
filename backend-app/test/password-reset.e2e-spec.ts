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

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * E2E thật với Postgres: cần `DATABASE_URL` trỏ tới DB đã chạy `prisma migrate deploy`.
 * MailService được thay bằng mock để lấy token gốc trong email (token này chỉ có trong mail),
 * mọi thứ còn lại (auth, prisma, guard, filter, interceptor) là code thật.
 */
describe('Quên mật khẩu (e2e)', () => {
  const oldPassword = 'MatKhauCu123';
  const newPassword = 'MatKhauMoi456';

  let app: INestApplication;
  let prisma: PrismaService;
  let userId: string;
  let email: string;
  let resetToken = '';
  const sentMails: SentMail[] = [];
  const sendPasswordResetEmail = jest.fn<(params: SentMail) => Promise<void>>(async (params) => {
    sentMails.push(params);
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService)
      .useValue({
        sendVerificationEmail: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
        sendPasswordResetEmail,
      })
      .compile();

    app = moduleRef.createNestApplication();
    applyAppSettings(app);
    await app.init();

    prisma = app.get(PrismaService);
    email = `e2e-reset-${Date.now()}@example.com`;

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(oldPassword, 10),
        fullName: 'E2E Quên Mật Khẩu',
        emailVerifiedAt: new Date(),
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    // Xoá dữ liệu test (token cascade theo user).
    await prisma.passwordResetToken.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await app.close();
  });

  it('email không tồn tại: trả message trung tính và không gửi mail', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/forgot-password')
      .send({ email: 'khong-ton-tai-e2e@example.com' })
      .expect(201);

    const body = response.body as ApiEnvelope<{ message: string }>;
    expect(body.success).toBe(true);
    expect(body.data.message).toContain('Nếu email này đã đăng ký');
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('email tồn tại: gửi mail và DB chỉ lưu hash của token', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/forgot-password')
      .send({ email })
      .expect(201);

    const body = response.body as ApiEnvelope<{ message: string }>;
    expect(body.success).toBe(true);
    expect(body.data.message).toContain('Nếu email này đã đăng ký');

    expect(sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    const sent = sentMails.at(-1);
    expect(sent?.to).toBe(email);

    resetToken = sent?.token ?? '';
    expect(resetToken).toMatch(/^[a-f0-9]{64}$/);

    // DB có hash, không có token gốc.
    const stored = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: sha256(resetToken) },
    });
    expect(stored).not.toBeNull();
    expect(stored?.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(await prisma.passwordResetToken.findUnique({ where: { tokenHash: resetToken } })).toBeNull();
  });

  it('đặt lại mật khẩu: đổi được, thu hồi phiên cũ và token không dùng lại được', async () => {
    // Phiên đăng nhập trước khi reset.
    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: oldPassword })
      .expect(201);
    const loginBody = loginResponse.body as ApiEnvelope<{ refreshToken: string }>;
    const oldRefreshToken = loginBody.data.refreshToken;
    expect(oldRefreshToken).toBeTruthy();

    const resetResponse = await request(app.getHttpServer())
      .post('/api/auth/reset-password')
      .send({ token: resetToken, newPassword })
      .expect(201);
    const resetBody = resetResponse.body as ApiEnvelope<{ message: string }>;
    expect(resetBody.data.message).toContain('Đặt lại mật khẩu thành công');

    // Token vừa dùng bị đánh dấu usedAt trong DB.
    const used = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: sha256(resetToken) },
    });
    expect(used?.usedAt).not.toBeNull();

    // Phiên cũ bị thu hồi: refresh token trước đó không còn hiệu lực.
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refreshToken: oldRefreshToken })
      .expect(401);

    // Mật khẩu cũ không đăng nhập được, mật khẩu mới thì được.
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: oldPassword })
      .expect(401);
    const newLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: newPassword })
      .expect(201);
    const newLoginBody = newLogin.body as ApiEnvelope<{ user: { email: string } }>;
    expect(newLoginBody.data.user.email).toBe(email);

    // Dùng lại đúng link cũ → 400.
    const reused = await request(app.getHttpServer())
      .post('/api/auth/reset-password')
      .send({ token: resetToken, newPassword: 'MatKhauKhac789' })
      .expect(400);
    const reusedBody = reused.body as { message: string };
    expect(reusedBody.message).toContain('không hợp lệ hoặc đã hết hạn');
  });

  it('token hết hạn bị từ chối', async () => {
    const expiredRawToken = `expired-${Date.now()}-${'a'.repeat(32)}`;

    await prisma.passwordResetToken.create({
      data: {
        userId,
        tokenHash: sha256(expiredRawToken),
        expiresAt: new Date(Date.now() - 60 * 1000),
      },
    });

    const response = await request(app.getHttpServer())
      .post('/api/auth/reset-password')
      .send({ token: expiredRawToken, newPassword: 'MatKhauHetHan789' })
      .expect(400);

    const body = response.body as { message: string };
    expect(body.message).toContain('không hợp lệ hoặc đã hết hạn');

    // Mật khẩu hiện tại không đổi.
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: newPassword })
      .expect(201);
  });
});
