import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { AVATAR_FRAMES } from '../src/modules/users/avatar-frame.constants';
import { applyAppSettings } from './create-test-app';

interface Envelope<T> {
  success: boolean;
  data: T;
}

interface AvatarFrameItem {
  id: string;
  name: string;
  minLevel: number;
  assetUrl: string;
  unlocked: boolean;
}

interface AvatarFramesPayload {
  items: AvatarFrameItem[];
  currentFrameId: string | null;
}

interface ProfilePayload {
  id: string;
  level: number;
  avatarFrameId: string | null;
  avatarFrameUrl: string | null;
}

const password = 'MatKhau123';

/**
 * E2E thật với Postgres cho khung avatar:
 * danh sách khung kèm trạng thái mở khoá theo level, chọn khung hợp lệ, chặn khung
 * chưa đủ cấp / không tồn tại, bỏ khung và đồng bộ vào hồ sơ + login.
 */
describe('Khung avatar (e2e)', () => {
  const suffix = Date.now();

  let app: INestApplication;
  let prisma: PrismaService;
  let userId: string;
  let userEmail: string;
  let token: string;

  const server = () => request(app.getHttpServer());
  const bearer = () => ({ Authorization: `Bearer ${token}` });

  async function login(): Promise<Envelope<{ user: ProfilePayload; accessToken: string }>> {
    const response = await server()
      .post('/api/auth/login')
      .send({ email: userEmail, password })
      .expect(201);

    return response.body as Envelope<{ user: ProfilePayload; accessToken: string }>;
  }

  async function frames(): Promise<AvatarFramesPayload> {
    const response = await server()
      .get('/api/avatar-frames')
      .set(bearer())
      .expect(200);

    return (response.body as Envelope<AvatarFramesPayload>).data;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    applyAppSettings(app);
    await app.init();

    prisma = app.get(PrismaService);
    userEmail = `e2e-frame-${suffix}@example.com`;

    const user = await prisma.user.create({
      data: {
        email: userEmail,
        passwordHash: await bcrypt.hash(password, 10),
        fullName: 'E2E Khung avatar',
        emailVerifiedAt: new Date(),
      },
      select: { id: true },
    });
    userId = user.id;

    token = (await login()).data.accessToken;
  });

  afterAll(async () => {
    await prisma.expLog.deleteMany({ where: { userId } });
    await prisma.notification.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await app.close();
  });

  it('trả đủ catalog, khung cấp 1 mở sẵn và khung cao bị khoá', async () => {
    const data = await frames();

    expect(data.items).toHaveLength(AVATAR_FRAMES.length);
    expect(data.currentFrameId).toBeNull();

    const bronze = data.items.find((frame) => frame.id === 'frame-bronze');
    expect(bronze?.unlocked).toBe(true);
    expect(bronze?.assetUrl).toContain('gradient');

    const gold = data.items.find((frame) => frame.id === 'frame-gold');
    expect(gold?.unlocked).toBe(false);
    expect(gold?.minLevel).toBeGreaterThan(1);
  });

  it('chọn khung đã mở → hồ sơ và login trả avatarFrameUrl', async () => {
    const response = await server()
      .patch('/api/users/me/avatar-frame')
      .set(bearer())
      .send({ frameId: 'frame-bronze' })
      .expect(200);
    const profile = (response.body as Envelope<ProfilePayload>).data;

    expect(profile.avatarFrameId).toBe('frame-bronze');
    expect(profile.avatarFrameUrl).toContain('gradient');

    const me = await server().get('/api/users/me').set(bearer()).expect(200);
    expect((me.body as Envelope<ProfilePayload>).data.avatarFrameId).toBe('frame-bronze');

    const session = await login();
    expect(session.data.user.avatarFrameId).toBe('frame-bronze');

    expect((await frames()).currentFrameId).toBe('frame-bronze');
  });

  it('chặn khung chưa đủ cấp, khung không tồn tại và cho bỏ khung', async () => {
    await server()
      .patch('/api/users/me/avatar-frame')
      .set(bearer())
      .send({ frameId: 'frame-gold' })
      .expect(403);

    await server()
      .patch('/api/users/me/avatar-frame')
      .set(bearer())
      .send({ frameId: 'frame-khong-ton-tai' })
      .expect(400);

    // Lên cấp 5 thì mở khung Vàng.
    await prisma.user.update({ where: { id: userId }, data: { level: 5 } });

    const unlocked = await server()
      .patch('/api/users/me/avatar-frame')
      .set(bearer())
      .send({ frameId: 'frame-gold' })
      .expect(200);
    expect((unlocked.body as Envelope<ProfilePayload>).data.avatarFrameId).toBe('frame-gold');

    const cleared = await server()
      .patch('/api/users/me/avatar-frame')
      .set(bearer())
      .send({ frameId: null })
      .expect(200);
    const profile = (cleared.body as Envelope<ProfilePayload>).data;

    expect(profile.avatarFrameId).toBeNull();
    expect(profile.avatarFrameUrl).toBeNull();
    expect((await frames()).currentFrameId).toBeNull();
  });
});
