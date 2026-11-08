import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

/** Query của GET /api/notifications — ?page=1&limit=10&unreadOnly=true */
export class ListNotificationsQueryDto extends PaginationQueryDto {
  /** Chỉ lấy thông báo chưa đọc (readAt IS NULL) */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  unreadOnly?: boolean;
}
