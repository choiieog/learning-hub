import { IsBoolean } from 'class-validator';

/** Body của PATCH /api/admin/settings — `false` = tạm khoá đăng tài liệu. */
export class UpdateSettingsDto {
  @IsBoolean({ message: 'Giá trị phải là true hoặc false' })
  uploadsEnabled: boolean;
}
