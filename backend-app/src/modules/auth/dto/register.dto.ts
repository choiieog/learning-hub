import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MESSAGES,
  PASSWORD_MIN_LENGTH,
  PASSWORD_PATTERN,
} from '../../../common/validators/password.constraints';

const normalizeEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

/** Body of POST /api/auth/register */
export class RegisterDto {
  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'Email không hợp lệ' })
  email: string;

  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH, { message: PASSWORD_MESSAGES.minLength })
  @MaxLength(PASSWORD_MAX_LENGTH, { message: PASSWORD_MESSAGES.maxLength })
  @Matches(PASSWORD_PATTERN, { message: PASSWORD_MESSAGES.composition })
  password: string;

  @IsString()
  @IsNotEmpty({ message: 'Họ tên không được để trống' })
  @MaxLength(120)
  fullName: string;
}
