import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { applyAppSettings } from './create-test-app';

describe('Health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    applyAppSettings(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/health trả envelope success + status ok', async () => {
    const response = await request(app.getHttpServer()).get('/api/health').expect(200);

    const body = response.body as { success: boolean; data: { status: string } };
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('ok');
  });
});
