import { IsInt, Max, Min } from 'class-validator';
import { MAX_DOCUMENT_DAILY_LIMIT } from '../settings.constants';

/** Body của PATCH /api/admin/settings — 0 nghĩa là không giới hạn. */
export class UpdateSettingsDto {
  @IsInt({ message: 'Giới hạn phải là số nguyên' })
  @Min(0, { message: 'Giới hạn tối thiểu là 0 (không giới hạn)' })
  @Max(MAX_DOCUMENT_DAILY_LIMIT, {
    message: `Giới hạn tối đa là ${MAX_DOCUMENT_DAILY_LIMIT} bài/ngày`,
  })
  documentDailyLimit: number;
}
