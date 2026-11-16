import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { Role } from '../enums/role.enum';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface';
import configuration from '../../config/configuration';
import { PrismaService } from '../../infra/prisma/prisma.service';

interface AccessTokenPayload {
  sub: string;
  email: string;
  role: string;
  type?: string;
}

interface CachedUser {
  id: string;
  email: string;
  role: Role;
  status: string;
  emailVerifiedAt: Date | null;
  expiresAt: number;
}

/**
 * Cache user 30 giây: đổi role/ban vẫn có hiệu lực gần như ngay, nhưng một trang
 * gọi 5 API song song không còn 5 query `User` trùng nhau.
 *
 * Đặt ở module scope vì guard được Nest khởi tạo theo từng chỗ `@UseGuards`.
 */
const USER_CACHE_TTL_MS = 30_000;
const USER_CACHE = new Map<string, CachedUser>();

/**
 * Verifies the Bearer access token and attaches `request.user`.
 * Usage: `@UseGuards(JwtAuthGuard)` on any controller that must be private,
 * `@UseGuards(JwtAuthGuard, RolesGuard)` for admin-only routes.
 *
 * JwtService comes from the global JwtModule and PrismaService from the global
 * PrismaModule, so the guard needs no per-module provider registration.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const token = bearerToken(request);

    if (!token) {
      throw new UnauthorizedException('Bạn cần đăng nhập để thực hiện thao tác này');
    }

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: configuration().jwt.accessSecret,
      });
    } catch {
      throw new UnauthorizedException('Phiên đăng nhập không hợp lệ hoặc đã hết hạn');
    }

    if (payload.type === 'refresh') {
      throw new UnauthorizedException('Token không hợp lệ cho thao tác này');
    }

    const user = await this.loadUser(payload.sub);

    if (user.status === 'BANNED') {
      throw new ForbiddenException('Tài khoản đã bị khóa');
    }

    if (!user.emailVerifiedAt) {
      throw new ForbiddenException({
        message: 'Tài khoản chưa xác thực email',
        code: 'EMAIL_NOT_VERIFIED',
      });
    }

    request.user = {
      id: user.id,
      email: user.email,
      role: user.role,
    };

    return true;
  }

  /** User theo id, cache 30s; không tồn tại (đã xoá cứng) thì 401. */
  private async loadUser(userId: string): Promise<CachedUser> {
    const cached = USER_CACHE.get(userId);

    if (cached && cached.expiresAt > Date.now()) {
      return cached;
    }

    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true, email: true, role: true, status: true, emailVerifiedAt: true },
    });

    if (!user) {
      USER_CACHE.delete(userId);
      throw new UnauthorizedException('Tài khoản không tồn tại');
    }

    const entry: CachedUser = {
      ...user,
      role: user.role as Role,
      expiresAt: Date.now() + USER_CACHE_TTL_MS,
    };

    USER_CACHE.set(userId, entry);

    return entry;
  }
}

function bearerToken(request: Request): string | null {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return null;
  }

  const token = header.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}
