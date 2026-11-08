import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { DocumentStatus } from '../../../common/enums/document-status.enum';

/** ?subjectIds=a&subjectIds=b hoặc ?subjectIds=a,b → luôn là mảng đã trim. */
const toStringArray = ({ value }: { value: unknown }): string[] => {
  if (value === undefined || value === null || value === '') {
    return [];
  }

  return (Array.isArray(value) ? value : [value])
    .flatMap((item) => String(item).split(','))
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
};

/** Như trên, nhưng chuẩn hoá chữ thường để so khớp phần mở rộng file. */
const toFileTypes = ({ value }: { value: unknown }): string[] =>
  toStringArray({ value }).map((item) => item.toLowerCase());

/**
 * Query của GET /api/documents.
 * Mảng gửi lặp key: ?subjectIds=a&subjectIds=b (Angular toHttpParams hỗ trợ sẵn).
 * Decorator là bắt buộc vì ValidationPipe bật whitelist.
 */
export class ListDocumentsQueryDto extends PaginationQueryDto {
  /** Tìm trong tiêu đề + mô tả */
  @IsOptional()
  @IsString()
  @MaxLength(120, { message: 'keyword tối đa 120 ký tự' })
  keyword?: string;

  /** Lọc nhiều môn học */
  @IsOptional()
  @Transform(toStringArray)
  @IsArray()
  @IsString({ each: true })
  subjectIds?: string[];

  /** Lọc nhiều người đăng */
  @IsOptional()
  @Transform(toStringArray)
  @IsArray()
  @IsString({ each: true })
  authorIds?: string[];

  /** pdf | docx | pptx */
  @IsOptional()
  @Transform(toFileTypes)
  @IsArray()
  @IsIn(['pdf', 'docx', 'pptx'], { each: true, message: 'fileTypes chỉ nhận pdf, docx, pptx' })
  fileTypes?: string[];

  /** Chỉ admin dùng */
  @IsOptional()
  @IsEnum(DocumentStatus, { message: 'status không hợp lệ' })
  status?: DocumentStatus;

  /** (phase 2) điểm sao tối thiểu */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'minRating phải là số' })
  @Min(0, { message: 'minRating phải lớn hơn hoặc bằng 0' })
  minRating?: number;
}
