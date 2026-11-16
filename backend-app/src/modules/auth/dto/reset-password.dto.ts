import { IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MESSAGES,
  PASSWORD_MIN_LENGTH,
  PASSWORD_PATTERN,
} from '../../../common/validators/password.constraints';

/** Body of POST /api/auth/reset-password — raw token from the email link + the new password. */
export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty({ message: 'Thiếu token đặt lại mật khẩu' })
  token: string;

  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH, { message: PASSWORD_MESSAGES.minLength })
  @MaxLength(PASSWORD_MAX_LENGTH, { message: PASSWORD_MESSAGES.maxLength })
  @Matches(PASSWORD_PATTERN, { message: PASSWORD_MESSAGES.composition })
  newPassword: string;
}
