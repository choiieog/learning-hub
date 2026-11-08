import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Body của PATCH /api/users/me/avatar-frame — null để bỏ khung đang dùng. */
export class UpdateAvatarFrameDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  frameId: string | null;
}
