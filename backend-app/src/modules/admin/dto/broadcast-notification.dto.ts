import { IsString, MaxLength, MinLength } from 'class-validator';

/** Body của POST /api/admin/notifications/broadcast — gửi một thông báo chung cho mọi sinh viên. */
export class BroadcastNotificationDto {
  @IsString()
  @MinLength(5, { message: 'Tiêu đề phải có ít nhất 5 ký tự' })
  @MaxLength(120, { message: 'Tiêu đề tối đa 120 ký tự' })
  title: string;

  @IsString()
  @MinLength(10, { message: 'Nội dung phải có ít nhất 10 ký tự' })
  @MaxLength(1000, { message: 'Nội dung tối đa 1000 ký tự' })
  message: string;
}
