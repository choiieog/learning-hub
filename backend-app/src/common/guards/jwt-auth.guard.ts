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

    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, deletedAt: null },
      select: { id: true, email: true, role: true, status: true, emailVerifiedAt: true },
    });

    if (!user) {
      throw new UnauthorizedException('Tài khoản không tồn tại');
    }

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
      role: user.role as Role,
    };

    return true;
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
