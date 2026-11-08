import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

/** Body của POST /api/documents/:documentId/ratings — gửi lại sẽ cập nhật đánh giá cũ. */
export class UpsertRatingDto {
  @IsInt({ message: 'Số sao phải là số nguyên' })
  @Min(1, { message: 'Số sao tối thiểu là 1' })
  @Max(5, { message: 'Số sao tối đa là 5' })
  stars: number;

  /** Nhận xét không bắt buộc; gửi chuỗi rỗng để xoá nhận xét cũ. */
  @IsOptional()
  @IsString()
  @MinLength(0)
  @MaxLength(1000, { message: 'Nhận xét tối đa 1000 ký tự' })
  comment?: string;
}
