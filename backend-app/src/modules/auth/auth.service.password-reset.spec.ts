import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { createHash } from 'node:crypto';
import { MailService } from '../../infra/mail/mail.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuthService } from './auth.service';

interface ResetTokenRecord {
  id: string;
  userId: string;
  usedAt: Date | null;
  expiresAt: Date;
  user: { id: string; deletedAt: Date | null };
}

const RAW_TOKEN = 'raw-reset-token';
const NEW_PASSWORD = 'MatKhauMoi123';
const OLD_PASSWORD = 'MatKhauCu123';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function validToken(overrides: Partial<ResetTokenRecord> = {}): ResetTokenRecord {
  return {
    id: 'token-1',
    userId: 'user-1',
    usedAt: null,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    user: { id: 'user-1', deletedAt: null },
    ...overrides,
  };
}

/** Mock hàm async: `mockResolvedValue` nhận mọi giá trị, không bị suy ra `never`. */
function asyncMock() {
  return jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue(undefined);
}

function createPrismaMock() {
  return {
    passwordResetToken: {
      findUnique: asyncMock(),
      findFirst: asyncMock(),
      create: asyncMock(),
      update: asyncMock(),
      updateMany: asyncMock(),
    },
    user: {
      findFirst: asyncMock(),
      update: asyncMock(),
    },
    $transaction: asyncMock(),
  };
}

function createMailMock() {
  return {
    sendPasswordResetEmail: asyncMock(),
  };
}

describe('AuthService — quên mật khẩu', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let mail: ReturnType<typeof createMailMock>;
  let service: AuthService;

  beforeEach(() => {
    prisma = createPrismaMock();
    mail = createMailMock();
    service = new AuthService(
      prisma as unknown as PrismaService,
      {} as JwtService,
      mail as unknown as MailService,
    );
  });

  describe('resetPassword', () => {
    it('từ chối token đã hết hạn và không đổi mật khẩu', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(
        validToken({ expiresAt: new Date(Date.now() - 1000) }),
      );

      await expect(service.resetPassword(RAW_TOKEN, NEW_PASSWORD)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('từ chối token đã dùng (dùng lại link cũ)', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(validToken({ usedAt: new Date() }));

      await expect(service.resetPassword(RAW_TOKEN, NEW_PASSWORD)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('từ chối token không tồn tại', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(null);

      await expect(service.resetPassword(RAW_TOKEN, NEW_PASSWORD)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('từ chối khi tài khoản đã bị xoá mềm', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(
        validToken({ user: { id: 'user-1', deletedAt: new Date() } }),
      );

      await expect(service.resetPassword(RAW_TOKEN, NEW_PASSWORD)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('tra token bằng sha256, không bao giờ bằng token gốc', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(validToken());

      await service.resetPassword(RAW_TOKEN, NEW_PASSWORD);

      expect(prisma.passwordResetToken.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tokenHash: sha256(RAW_TOKEN) } }),
      );
    });

    it('đổi mật khẩu, đánh dấu token đã dùng và thu hồi mọi phiên', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(validToken());

      const result = await service.resetPassword(RAW_TOKEN, NEW_PASSWORD);

      expect(result.message).toContain('Đặt lại mật khẩu thành công');
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);

      // Token vừa dùng và mọi link khác của tài khoản đều hết hiệu lực.
      expect(prisma.passwordResetToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'token-1' },
          data: { usedAt: expect.any(Date) },
        }),
      );
      expect(prisma.passwordResetToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1', usedAt: null },
          data: { usedAt: expect.any(Date) },
        }),
      );

      // Mật khẩu mới được hash, mật khẩu cũ không còn dùng được, refresh token bị xoá.
      const userUpdate = prisma.user.update.mock.calls[0][0] as {
        data: { passwordHash: string; refreshTokenHash: string | null };
      };
      expect(userUpdate.data.refreshTokenHash).toBeNull();
      await expect(bcrypt.compare(NEW_PASSWORD, userUpdate.data.passwordHash)).resolves.toBe(true);
      await expect(bcrypt.compare(OLD_PASSWORD, userUpdate.data.passwordHash)).resolves.toBe(false);
    });
  });

  describe('forgotPassword', () => {
    it('email không tồn tại: trả message trung tính, không tạo token, không gửi mail', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      const result = await service.forgotPassword('khong-ton-tai@example.com');

      expect(result.message).toContain('Nếu email này đã đăng ký');
      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
      expect(mail.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('email tồn tại: lưu hash + hạn 1 giờ và gửi mail chứa token gốc', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: 'user-1',
        email: 'sinhvien@example.com',
        fullName: 'Phạm Thu Hà',
      });
      prisma.passwordResetToken.findFirst.mockResolvedValue(null);

      const before = Date.now();
      await service.forgotPassword('sinhvien@example.com');

      const created = prisma.passwordResetToken.create.mock.calls[0][0] as {
        data: { userId: string; tokenHash: string; expiresAt: Date };
      };
      expect(created.data.userId).toBe('user-1');
      expect(created.data.tokenHash).toMatch(/^[a-f0-9]{64}$/);
      expect(created.data.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 59 * 60 * 1000);
      expect(created.data.expiresAt.getTime()).toBeLessThanOrEqual(before + 61 * 60 * 1000);

      const sent = mail.sendPasswordResetEmail.mock.calls[0][0] as {
        to: string;
        fullName: string;
        token: string;
      };
      expect(sent.to).toBe('sinhvien@example.com');
      expect(sent.token).toMatch(/^[a-f0-9]{64}$/);
      // DB chỉ giữ hash; token trong mail là token gốc tương ứng.
      expect(created.data.tokenHash).toBe(sha256(sent.token));
    });

    it('trong 5 phút kể từ lần gửi trước: không gửi thêm mail nhưng vẫn trả message trung tính', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: 'user-1',
        email: 'sinhvien@example.com',
        fullName: 'Phạm Thu Hà',
      });
      prisma.passwordResetToken.findFirst.mockResolvedValue({
        id: 'token-0',
        createdAt: new Date(Date.now() - 60 * 1000),
      });

      const result = await service.forgotPassword('sinhvien@example.com');

      expect(result.message).toContain('Nếu email này đã đăng ký');
      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
      expect(mail.sendPasswordResetEmail).not.toHaveBeenCalled();
    });
  });
});
