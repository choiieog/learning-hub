import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 50;

/**
 * Phân trang dùng chung: ?page=1&limit=10&sort=createdAt:desc
 *
 * Every field needs a decorator: ValidationPipe runs with `whitelist: true`,
 * so a property without validation metadata is stripped from the query object.
 */
export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page phải là số nguyên' })
  @Min(1, { message: 'page phải lớn hơn hoặc bằng 1' })
  page: number = DEFAULT_PAGE;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit phải là số nguyên' })
  @Min(1, { message: 'limit phải lớn hơn hoặc bằng 1' })
  @Max(MAX_PAGE_SIZE, { message: `limit tối đa ${MAX_PAGE_SIZE}` })
  limit: number = DEFAULT_PAGE_SIZE;

  /** vd: createdAt:desc | viewCount:desc | ratingAvg:desc */
  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z]+:(asc|desc)$/, { message: 'sort phải có dạng field:asc hoặc field:desc' })
  sort?: string;
}
