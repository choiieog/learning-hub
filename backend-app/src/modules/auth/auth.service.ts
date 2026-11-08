import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import configuration from '../../config/configuration';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { MailService } from '../../infra/mail/mail.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

const BCRYPT_ROUNDS = 10;
const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const RESEND_COOLDOWN_MS = 5 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

/**
 * Authentication business logic — see docs/DECISIONS.md section 2.
 *
 * Security notes:
 *  - passwords are hashed with bcrypt (10 rounds) and never returned;
 *  - verification tokens are stored as sha256 hashes, the raw token only travels
 *    inside the email link, is single use and expires after 24 hours;
 *  - refresh tokens are JWTs signed with a separate secret and only their hash is
 *    stored, so rotating or clearing it revokes every session.
 */
@Injectable()
export class AuthService {
  private readonly config = configuration();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly mail: MailService,
  ) {}

  async register(dto: RegisterDto): Promise<{ message: string }> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });

    if (existing) {
      throw new ConflictException('Email này đã được đăng ký');
    }

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash: await bcrypt.hash(dto.password, BCRYPT_ROUNDS),
        fullName: dto.fullName,
        studentCode: dto.studentCode,
      },
    });

    await this.sendVerificationLink(user.id, user.email, user.fullName);

    return {
      message: 'Đăng ký thành công. Vui lòng kiểm tra email để xác thực tài khoản.',
    };
  }

  async verifyEmail(token: string): Promise<{ message: string }> {
    const record = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash: sha256(token) },
      include: { user: true },
    });

    if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Link xác thực không hợp lệ hoặc đã hết hạn');
    }

    await this.prisma.$transaction([
      this.prisma.emailVerificationToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: record.userId },
        data: { emailVerifiedAt: record.user.emailVerifiedAt ?? new Date() },
      }),
    ]);

    return { message: 'Xác thực email thành công. Bạn có thể đăng nhập.' };
  }

  async resendVerification(email: string): Promise<{ message: string }> {
    const user = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
    });

    if (user && !user.emailVerifiedAt) {
      const last = await this.prisma.emailVerificationToken.findFirst({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
      });

      if (last && Date.now() - last.createdAt.getTime() < RESEND_COOLDOWN_MS) {
        throw new HttpException(
          'Bạn vừa yêu cầu gửi lại email, vui lòng thử lại sau ít phút',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      await this.sendVerificationLink(user.id, user.email, user.fullName);
    }

    // Same answer whether or not the account exists (no account enumeration).
    return {
      message: 'Nếu email này chưa được xác thực, chúng tôi đã gửi lại link xác thực.',
    };
  }

  /**
   * Gửi link đặt lại mật khẩu. Luôn trả cùng một message để không lộ email có tồn tại hay không;
   * trong 5 phút kể từ lần gửi trước thì bỏ qua (không báo lỗi) để tránh spam hộp thư.
   */
  async forgotPassword(email: string): Promise<{ message: string }> {
    const user = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
    });

    if (user) {
      const last = await this.prisma.passwordResetToken.findFirst({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
      });

      if (!last || Date.now() - last.createdAt.getTime() >= RESEND_COOLDOWN_MS) {
        // Chỉ link mới nhất còn hiệu lực.
        await this.prisma.passwordResetToken.updateMany({
          where: { userId: user.id, usedAt: null },
          data: { usedAt: new Date() },
        });

        await this.sendPasswordResetLink(user.id, user.email, user.fullName);
      }
    }

    return {
      message: 'Nếu email này đã đăng ký, chúng tôi đã gửi link đặt lại mật khẩu. Hãy kiểm tra hộp thư.',
    };
  }

  /**
   * Đổi mật khẩu bằng token trong email: token dùng một lần, hạn 1 giờ.
   * Đổi xong xoá `refreshTokenHash` để thu hồi mọi phiên đang đăng nhập.
   */
  async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: sha256(token) },
      include: { user: true },
    });

    if (
      !record ||
      record.usedAt ||
      record.expiresAt.getTime() < Date.now() ||
      record.user.deletedAt
    ) {
      throw new BadRequestException('Link đặt lại mật khẩu không hợp lệ hoặc đã hết hạn');
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

    await this.prisma.$transaction([
      this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      // Mọi link khác của tài khoản này cũng hết hiệu lực.
      this.prisma.passwordResetToken.updateMany({
        where: { userId: record.userId, usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash, refreshTokenHash: null },
      }),
    ]);

    return { message: 'Đặt lại mật khẩu thành công. Vui lòng đăng nhập bằng mật khẩu mới.' };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email, deletedAt: null },
    });

    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
    }

    if (user.status === 'BANNED') {
      throw new ForbiddenException('Tài khoản đã bị khóa, vui lòng liên hệ quản trị viên');
    }

    if (!user.emailVerifiedAt) {
      throw new ForbiddenException({
        message: 'Tài khoản chưa xác thực email. Vui lòng kiểm tra hộp thư của bạn.',
        code: 'EMAIL_NOT_VERIFIED',
      });
    }

    return this.issueTokens(user.id);
  }

  async refresh(refreshToken: string) {
    let payload: { sub: string; type?: string };
    try {
      payload = await this.jwt.verifyAsync<{ sub: string; type?: string }>(refreshToken, {
        secret: this.config.jwt.refreshSecret,
      });
    } catch {
      throw new UnauthorizedException('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại');
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Token không hợp lệ cho thao tác này');
    }

    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, deletedAt: null },
      select: { id: true, refreshTokenHash: true, status: true },
    });

    if (!user || !user.refreshTokenHash || user.refreshTokenHash !== sha256(refreshToken)) {
      throw new UnauthorizedException('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại');
    }

    if (user.status === 'BANNED') {
      throw new ForbiddenException('Tài khoản đã bị khóa, vui lòng liên hệ quản trị viên');
    }

    return this.issueTokens(user.id);
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new UnauthorizedException('Tài khoản không tồn tại');
    }

    if (!(await bcrypt.compare(dto.currentPassword, user.passwordHash))) {
      throw new BadRequestException('Mật khẩu hiện tại không đúng');
    }

    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException('Mật khẩu mới phải khác mật khẩu hiện tại');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS),
        // Revoke every existing session.
        refreshTokenHash: null,
      },
    });

    return {
      message: 'Đổi mật khẩu thành công. Vui lòng đăng nhập lại trên các thiết bị khác.',
    };
  }

  private async sendVerificationLink(userId: string, email: string, fullName: string) {
    const rawToken = randomBytes(32).toString('hex');

    await this.prisma.emailVerificationToken.create({
      data: {
        userId,
        tokenHash: sha256(rawToken),
        expiresAt: new Date(Date.now() + VERIFICATION_TTL_MS),
      },
    });

    await this.mail.sendVerificationEmail({ to: email, fullName, token: rawToken });
  }

  private async sendPasswordResetLink(userId: string, email: string, fullName: string) {
    const rawToken = randomBytes(32).toString('hex');

    await this.prisma.passwordResetToken.create({
      data: {
        userId,
        tokenHash: sha256(rawToken),
        expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
      },
    });

    await this.mail.sendPasswordResetEmail({ to: email, fullName, token: rawToken });
  }

  private async issueTokens(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { avatarFrame: true },
    });

    const accessToken = await this.jwt.signAsync(
      { sub: user.id, email: user.email, role: user.role },
      { secret: this.config.jwt.accessSecret, expiresIn: this.config.jwt.accessTtlSeconds },
    );

    const refreshToken = await this.jwt.signAsync(
      { sub: user.id, type: 'refresh' },
      { secret: this.config.jwt.refreshSecret, expiresIn: this.config.jwt.refreshTtlSeconds },
    );

    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshTokenHash: sha256(refreshToken) },
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        studentCode: user.studentCode,
        bio: user.bio,
        avatarUrl: user.avatarUrl,
        avatarFrameId: user.avatarFrameId,
        avatarFrameUrl: user.avatarFrame?.assetUrl ?? null,
        role: user.role,
        status: user.status,
        warningCount: user.warningCount,
        level: user.level,
        exp: user.exp,
        emailVerifiedAt: user.emailVerifiedAt,
        createdAt: user.createdAt,
      },
    };
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
