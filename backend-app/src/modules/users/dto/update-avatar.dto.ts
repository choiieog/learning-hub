import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * Body của PATCH /api/users/me/avatar — url trả về từ POST /api/uploads (folder "avatars").
 * Chỉ nhận URL do server sinh ra; kiểm tra tiền tố ở UsersService.
 */
export class UpdateAvatarDto {
  @IsString()
  @IsNotEmpty({ message: 'Thiếu đường dẫn ảnh đại diện' })
  @MaxLength(300, { message: 'Đường dẫn ảnh đại diện quá dài' })
  avatarUrl: string;
}
