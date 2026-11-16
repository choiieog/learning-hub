import { IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MESSAGES,
  PASSWORD_MIN_LENGTH,
  PASSWORD_PATTERN,
} from '../../../common/validators/password.constraints';

/** Body of PATCH /api/auth/password — cùng rule mật khẩu với register / reset. */
export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty({ message: 'Mật khẩu hiện tại không được để trống' })
  currentPassword: string;

  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH, { message: PASSWORD_MESSAGES.minLength })
  @MaxLength(PASSWORD_MAX_LENGTH, { message: PASSWORD_MESSAGES.maxLength })
  @Matches(PASSWORD_PATTERN, { message: PASSWORD_MESSAGES.composition })
  newPassword: string;
}
