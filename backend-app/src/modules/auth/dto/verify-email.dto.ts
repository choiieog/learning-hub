import { IsNotEmpty, IsString } from 'class-validator';

/** Body of POST /api/auth/verify-email — the raw token taken from the email link. */
export class VerifyEmailDto {
  @IsString()
  @IsNotEmpty({ message: 'Thiếu token xác thực' })
  token: string;
}
