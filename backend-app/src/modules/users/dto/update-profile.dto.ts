import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/**
 * Body của PATCH /api/users/me.
 *
 * Mọi field đều optional (chỉ gửi field muốn đổi). Toàn bộ đều phải có decorator,
 * vì `ValidationPipe({ whitelist: true })` sẽ xoá field không được khai báo.
 * `studentCode` / `bio` gửi chuỗi rỗng nghĩa là xoá giá trị.
 */
export class UpdateProfileDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: 'Họ tên phải có ít nhất 2 ký tự' })
  @MaxLength(120, { message: 'Họ tên tối đa 120 ký tự' })
  fullName?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(20, { message: 'Mã sinh viên tối đa 20 ký tự' })
  @Matches(/^$|^[A-Za-z0-9._-]{3,20}$/, {
    message: 'Mã sinh viên 3–20 ký tự, chỉ gồm chữ, số và . _ -',
  })
  studentCode?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500, { message: 'Giới thiệu tối đa 500 ký tự' })
  bio?: string;
}
