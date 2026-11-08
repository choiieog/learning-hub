/** Body của POST /api/documents */

import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { maxUploadSizeBytes } from '../../../common/constants/upload.constants';

export class DocumentFileInputDto {
  /** url trả về từ POST /api/uploads */
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  url: string;
  /** key trên storage để xóa file khi cần */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  publicId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name: string;

  /** bytes */
  @IsInt()
  @Min(1)
  @Max(maxUploadSizeBytes())
  size: number;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  mimeType: string;
}

export class CreateDocumentDto {
  @IsString()
  @MinLength(5)
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  /** Nội dung markdown tùy chọn (bài viết hướng dẫn) */
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  content?: string;

  @IsUUID()
  subjectId: string;

  /** 1–3 file đính kèm: pdf/docx/pptx, mỗi file ≤ MAX_UPLOAD_SIZE_MB */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => DocumentFileInputDto)
  files: DocumentFileInputDto[];
}
