/** Body của POST /api/documents */

import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

/**
 * File đính kèm: chỉ cần `publicId` trả về từ POST /api/uploads.
 * url/name/size/mimeType đọc từ bảng `UploadedFile` ở server, không nhận từ client.
 */
export class DocumentFileInputDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  publicId: string;
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
