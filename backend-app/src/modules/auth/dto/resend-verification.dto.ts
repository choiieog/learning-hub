import { Transform } from 'class-transformer';
import { IsEmail } from 'class-validator';

/** Body of POST /api/auth/resend-verification */
export class ResendVerificationDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'Email không hợp lệ' })
  email: string;
}
