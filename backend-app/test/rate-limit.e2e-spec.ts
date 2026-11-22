import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import configuration from '../src/config/configuration';
import { applyAppSettings } from './create-test-app';

interface ErrorBody {
  success: boolean;
  statusCode: number;
  message: string;
}

/**
 * E2E thật cho `RateLimitGuard`: đếm theo route + IP trong bộ đếm RAM của app.
 * Ngưỡng đọc từ `configuration()` để test vẫn đúng khi `.env` chỉnh giới hạn.
 */
describe('Giới hạn tần suất (e2e)', () => {
  const { rateLimit } = configuration();
  const wrongCredentials = {
    email: 'khong-ton-tai-rate-limit@example.com',
    password: 'SaiMatKhau123',
  };

  let app: INestApplication;

  const server = () => request(app.getHttpServer());

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    applyAppSettings(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('login sai quá số lần cho phép thì trả 429 kèm Retry-After', async () => {
    const { limit } = rateLimit.login;

    for (let attempt = 1; attempt <= limit; attempt += 1) {
      await server().post('/api/auth/login').send(wrongCredentials).expect(401);
    }

    const blocked = await server().post('/api/auth/login').send(wrongCredentials).expect(429);
    expect((blocked.body as ErrorBody).message).toContain('thử đăng nhập quá nhiều lần');
    expect(blocked.headers['x-ratelimit-limit']).toBe(String(limit));
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('register quá số lần cho phép thì trả 429', async () => {
    const { limit } = rateLimit.register;

    for (let attempt = 1; attempt <= limit; attempt += 1) {
      // Body rỗng: guard chạy trước ValidationPipe nên vẫn bị đếm.
      await server().post('/api/auth/register').send({}).expect(400);
    }

    const blocked = await server().post('/api/auth/register').send({}).expect(429);
    expect((blocked.body as ErrorBody).message).toContain('tạo quá nhiều tài khoản');
  });

  it('bộ đếm tách riêng từng route', async () => {
    // Login đã bị chặn ở test trước, nhưng route khác vẫn phải chạy bình thường.
    await server()
      .post('/api/auth/forgot-password')
      .send({ email: 'khong-hop-le' })
      .expect(400);
    await server().post('/api/auth/login').send(wrongCredentials).expect(429);
  });
});
