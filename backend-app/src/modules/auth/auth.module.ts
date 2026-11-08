import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import configuration from '../../config/configuration';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

/**
 * JwtModule is global so JwtAuthGuard can be used from any controller without
 * re-importing this module. Access and refresh tokens use different secrets and
 * the secret is passed explicitly on every sign/verify call.
 */
@Module({
  imports: [
    JwtModule.register({
      global: true,
      secret: configuration().jwt.accessSecret,
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
