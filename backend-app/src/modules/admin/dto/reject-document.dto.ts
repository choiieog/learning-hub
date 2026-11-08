/** Body của PATCH /api/admin/documents/:id/reject */

import { IsString, MaxLength, MinLength } from 'class-validator';

export class RejectDocumentDto {
  /** Lý do hiển thị cho tác giả — bắt buộc, đủ cụ thể để họ sửa bài. */
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason: string;
}
