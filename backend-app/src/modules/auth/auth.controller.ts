import {
  Body,
  Controller,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import configuration from '../../config/configuration';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  clearRefreshCookie,
  readRefreshCookie,
  setRefreshCookie,
} from '../../common/utils/refresh-cookie.util';
import { AuthService } from './auth.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';

const rateLimit = configuration().rateLimit;

/**
 * Public routes: /api/auth/*
 *
 * Refresh token không nằm trong body response mà nằm trong cookie HttpOnly
 * (`lh_refresh`), nên JavaScript ở frontend không đọc được. Body chỉ trả
 * `accessToken` (sống trong memory) + `user`.
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /** POST /api/auth/register → creates an unverified account and sends the verification link */
  @Post('register')
  @RateLimit({
    limit: rateLimit.register.limit,
    windowMs: rateLimit.register.windowMs,
    message:
      'Bạn đã tạo quá nhiều tài khoản từ địa chỉ này. Vui lòng thử lại sau ít phút.',
  })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  /** POST /api/auth/verify-email — activates the account behind the token */
  @Post('verify-email')
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto.token);
  }

  /** POST /api/auth/resend-verification — throttled re-send of the verification link */
  @Post('resend-verification')
  @RateLimit({
    limit: rateLimit.resendVerification.limit,
    windowMs: rateLimit.resendVerification.windowMs,
    message: 'Bạn yêu cầu gửi lại email quá nhiều lần. Vui lòng thử lại sau ít phút.',
  })
  resendVerification(@Body() dto: ResendVerificationDto) {
    return this.authService.resendVerification(dto.email);
  }

  /** POST /api/auth/forgot-password — sends a reset link (same answer whether the email exists or not) */
  @Post('forgot-password')
  @RateLimit({
    limit: rateLimit.forgotPassword.limit,
    windowMs: rateLimit.forgotPassword.windowMs,
    message: 'Bạn yêu cầu đặt lại mật khẩu quá nhiều lần. Vui lòng thử lại sau ít phút.',
  })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  /** POST /api/auth/reset-password — one-time token from the email + the new password */
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.newPassword);
  }

  /** POST /api/auth/login → { accessToken, user } + cookie refresh token — 403 when email is unverified */
  @Post('login')
  @RateLimit({
    limit: rateLimit.login.limit,
    windowMs: rateLimit.login.windowMs,
    message: 'Bạn đã thử đăng nhập quá nhiều lần. Vui lòng thử lại sau ít phút.',
  })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const session = await this.authService.login(dto);
    setRefreshCookie(res, session.refreshToken);

    return { accessToken: session.accessToken, user: session.user };
  }

  /**
   * POST /api/auth/refresh — đọc refresh token từ cookie HttpOnly (hoặc body cho
   * client không dùng cookie), rotate token và trả access token mới.
   */
  @Post('refresh')
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = readRefreshCookie(req) ?? dto?.refreshToken;

    if (!token) {
      throw new UnauthorizedException('Thiếu refresh token, vui lòng đăng nhập lại');
    }

    const session = await this.authService.refresh(token);
    setRefreshCookie(res, session.refreshToken);

    return { accessToken: session.accessToken, user: session.user };
  }

  /** POST /api/auth/logout — thu hồi phiên hiện tại (hash trong DB) và xoá cookie. */
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.authService.revokeSession(readRefreshCookie(req));
    clearRefreshCookie(res);

    return { message: 'Đã đăng xuất.' };
  }

  /**
   * PATCH /api/auth/password — giữ phiên hiện tại: trả access token mới + set lại cookie,
   * các thiết bị khác (dùng hash cũ) bị đăng xuất.
   */
  @Patch('password')
  @UseGuards(JwtAuthGuard)
  async changePassword(
    @CurrentUser('id') userId: string,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.authService.changePassword(userId, dto);
    setRefreshCookie(res, session.refreshToken);

    return {
      message: session.message,
      accessToken: session.accessToken,
      user: session.user,
    };
  }
}
