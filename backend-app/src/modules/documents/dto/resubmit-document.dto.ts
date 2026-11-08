import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { DocumentFileInputDto } from './create-document.dto';

/** Body của PATCH /api/documents/:id — chủ bài sửa rồi gửi duyệt lại bài bị từ chối. */
export class ResubmitDocumentDto {
  @IsString()
  @MinLength(5)
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  content?: string;

  @IsUUID()
  subjectId: string;

  /** Bỏ trống để giữ file cũ; gửi lên để thay toàn bộ file đính kèm. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => DocumentFileInputDto)
  files?: DocumentFileInputDto[];
}
