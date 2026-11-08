import { IsNotEmpty, IsString } from 'class-validator';

/** Body of POST /api/auth/refresh */
export class RefreshTokenDto {
  @IsString()
  @IsNotEmpty({ message: 'Thiếu refresh token' })
  refreshToken: string;
}
