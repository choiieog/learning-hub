import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/**
 * Body của POST /api/admin/subjects.
 * Cần decorator để `ValidationPipe({ whitelist: true })` giữ lại các field.
 */
export class CreateSubjectDto {
  /** Mã môn, vd: INT2204 (lưu dạng chữ hoa) */
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @MinLength(2, { message: 'Mã môn học phải có ít nhất 2 ký tự' })
  @MaxLength(20, { message: 'Mã môn học tối đa 20 ký tự' })
  @Matches(/^[A-Z0-9]+$/, { message: 'Mã môn học chỉ gồm chữ và số, không dấu cách' })
  code: string;

  @Transform(trim)
  @IsString()
  @MinLength(3, { message: 'Tên môn học phải có ít nhất 3 ký tự' })
  @MaxLength(120, { message: 'Tên môn học tối đa 120 ký tự' })
  name: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500, { message: 'Mô tả tối đa 500 ký tự' })
  description?: string;
}
