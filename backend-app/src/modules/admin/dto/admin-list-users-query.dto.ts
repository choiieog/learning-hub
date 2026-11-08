import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { Role } from '../../../common/enums/role.enum';

const toBoolean = ({ value }: { value: unknown }) => value === true || value === 'true';

/** Query của GET /api/admin/users */
export class AdminListUsersQueryDto extends PaginationQueryDto {
  /** Tìm theo email, họ tên, mã sinh viên */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  keyword?: string;

  @IsOptional()
  @IsEnum(Role, { message: 'role phải là USER hoặc ADMIN' })
  role?: Role;

  /** ACTIVE | WARNED | BANNED */
  @IsOptional()
  @IsIn(['ACTIVE', 'WARNED', 'BANNED'], { message: 'status không hợp lệ' })
  status?: string;

  /** Chỉ lấy tài khoản đã bị cảnh báo ít nhất 1 lần */
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  @Type(() => Boolean)
  warnedOnly?: boolean;
}
