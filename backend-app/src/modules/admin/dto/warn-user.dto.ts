import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Body của POST /api/admin/users/:id/warnings.
 * Cần decorator để `ValidationPipe({ whitelist: true })` giữ lại `reason`.
 */
export class WarnUserDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(10, { message: 'Lý do cảnh báo phải có ít nhất 10 ký tự' })
  @MaxLength(500, { message: 'Lý do cảnh báo tối đa 500 ký tự' })
  reason: string;
}
