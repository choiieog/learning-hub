import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

/** Body of POST /api/auth/reset-password — raw token from the email link + the new password. */
export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty({ message: 'Thiếu token đặt lại mật khẩu' })
  token: string;

  @IsString()
  @MinLength(8, { message: 'Mật khẩu phải có ít nhất 8 ký tự' })
  @MaxLength(72, { message: 'Mật khẩu tối đa 72 ký tự' })
  newPassword: string;
}
