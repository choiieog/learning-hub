import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from '../../common/dto/pagination-query.dto';
import { DocumentStatus } from '../../common/enums/document-status.enum';
import { Role } from '../../common/enums/role.enum';
import { UPLOAD_URL_PREFIX } from '../../common/constants/upload.constants';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

/** Hồ sơ của chính mình — không bao giờ trả passwordHash / refreshTokenHash. */
const SELF_PROFILE_SELECT = {
  id: true,
  email: true,
  fullName: true,
  studentCode: true,
  bio: true,
  avatarUrl: true,
  role: true,
  status: true,
  warningCount: true,
  level: true,
  exp: true,
  emailVerifiedAt: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

/** Thẻ tài khoản trong bảng quản lý của admin. */
const ADMIN_USER_SELECT = {
  id: true,
  email: true,
  fullName: true,
  studentCode: true,
  avatarUrl: true,
  role: true,
  status: true,
  warningCount: true,
  level: true,
  emailVerifiedAt: true,
  createdAt: true,
  _count: { select: { documents: { where: { deletedAt: null } } } },
} satisfies Prisma.UserSelect;

export interface SelfProfile {
  id: string;
  email: string;
  fullName: string;
  studentCode: string | null;
  bio: string | null;
  avatarUrl: string | null;
  role: Role;
  status: string;
  warningCount: number;
  level: number;
  exp: number;
  emailVerifiedAt: Date | null;
  createdAt: Date;
}

export interface PublicProfile {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  level: number;
  documentCount: number;
  totalViews: number;
}

export interface AdminUserSummary {
  id: string;
  email: string;
  fullName: string;
  studentCode: string | null;
  avatarUrl: string | null;
  role: string;
  status: string;
  warningCount: number;
  level: number;
  emailVerifiedAt: Date | null;
  createdAt: Date;
  documentCount: number;
}

export interface AdminUserWarning {
  id: string;
  reason: string;
  createdAt: Date;
  admin: { id: string; fullName: string };
}

export interface AdminUserDetail extends AdminUserSummary {
  bio: string | null;
  exp: number;
  warnings: AdminUserWarning[];
}

export interface AdminUsersQuery {
  page?: number;
  limit?: number;
  keyword?: string;
  role?: Role;
  status?: string;
  warnedOnly?: boolean;
}

export interface PaginatedUsers {
  items: AdminUserSummary[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

/**
 * Nghiệp vụ tài khoản: hồ sơ của chính mình + quản lý tài khoản cho admin.
 * Admin endpoint nằm ở modules/admin/admin-users.controller.ts.
 */
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Hồ sơ đầy đủ của chính mình (không gồm passwordHash). */
  async findById(userId: string): Promise<SelfProfile> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: SELF_PROFILE_SELECT,
    });

    if (!user) {
      throw new NotFoundException('Không tìm thấy tài khoản');
    }

    return user as SelfProfile;
  }

  /** Hồ sơ công khai: tên, avatar, level, số tài liệu đã duyệt + tổng lượt xem. */
  async getPublicProfile(userId: string): Promise<PublicProfile> {
    const [user, stats] = await Promise.all([
      this.prisma.user.findFirst({
        where: { id: userId, deletedAt: null },
        select: { id: true, fullName: true, avatarUrl: true, level: true },
      }),
      this.prisma.document.aggregate({
        where: { authorId: userId, status: DocumentStatus.APPROVED, deletedAt: null },
        _count: { _all: true },
        _sum: { viewCount: true },
      }),
    ]);

    if (!user) {
      throw new NotFoundException('Không tìm thấy người dùng');
    }

    return {
      ...user,
      documentCount: stats._count._all,
      totalViews: stats._sum.viewCount ?? 0,
    };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<SelfProfile> {
    const current = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true, studentCode: true },
    });

    if (!current) {
      throw new NotFoundException('Không tìm thấy tài khoản');
    }

    const data: Prisma.UserUpdateInput = {};

    if (dto.fullName !== undefined) {
      data.fullName = dto.fullName;
    }

    if (dto.studentCode !== undefined) {
      const studentCode = dto.studentCode.trim();
      data.studentCode = studentCode === '' ? null : studentCode;

      if (data.studentCode !== null && data.studentCode !== current.studentCode) {
        // Mã sinh viên là unique toàn bảng (kể cả tài khoản đã xoá mềm).
        const taken = await this.prisma.user.findFirst({
          where: { studentCode: data.studentCode, NOT: { id: userId } },
          select: { id: true },
        });

        if (taken) {
          throw new ConflictException('Mã sinh viên đã được dùng bởi tài khoản khác');
        }
      }
    }

    if (dto.bio !== undefined) {
      data.bio = dto.bio.trim() === '' ? null : dto.bio;
    }

    if (Object.keys(data).length === 0) {
      return this.findById(userId);
    }

    try {
      const user = await this.prisma.user.update({
        where: { id: userId },
        data,
        select: SELF_PROFILE_SELECT,
      });

      return user as SelfProfile;
    } catch (error) {
      // Chống race condition: hai request cùng set một mã sinh viên.
      if (isUniqueConstraintError(error)) {
        throw new ConflictException('Mã sinh viên đã được dùng bởi tài khoản khác');
      }

      throw error;
    }
  }

  async updateAvatar(userId: string, avatarUrl: string): Promise<SelfProfile> {
    // Chỉ nhận file do server mình lưu (tránh gán URL ngoài vào ảnh đại diện).
    if (!avatarUrl.startsWith(`${UPLOAD_URL_PREFIX}/avatars/`)) {
      throw new BadRequestException(
        'Ảnh đại diện phải được tải lên qua POST /api/uploads với folder "avatars".',
      );
    }

    return this.update(userId, { avatarUrl });
  }

  /** Danh sách tài khoản cho admin: tìm theo email/tên/mã SV, lọc role, status, đã bị cảnh báo. */
  async findAllForAdmin(query: AdminUsersQuery): Promise<PaginatedUsers> {
    const page = Math.max(1, Number(query.page) || DEFAULT_PAGE);
    const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(query.limit) || DEFAULT_PAGE_SIZE));

    const where: Prisma.UserWhereInput = { deletedAt: null };

    if (query.role) {
      where.role = query.role;
    }

    if (query.status) {
      where.status = query.status as Prisma.UserWhereInput['status'];
    }

    if (query.warnedOnly) {
      where.warningCount = { gt: 0 };
    }

    const keyword = query.keyword?.trim();
    if (keyword) {
      where.OR = [
        { email: { contains: keyword, mode: 'insensitive' } },
        { fullName: { contains: keyword, mode: 'insensitive' } },
        { studentCode: { contains: keyword, mode: 'insensitive' } },
      ];
    }

    const [total, users] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: ADMIN_USER_SELECT,
      }),
    ]);

    return {
      items: users.map(toAdminUserSummary),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /** Chi tiết tài khoản cho admin: thông tin + 10 cảnh báo gần nhất. */
  async findDetailForAdmin(userId: string): Promise<AdminUserDetail> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: {
        ...ADMIN_USER_SELECT,
        bio: true,
        exp: true,
        warnings: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            reason: true,
            createdAt: true,
            admin: { select: { id: true, fullName: true } },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('Không tìm thấy tài khoản');
    }

    const { warnings, ...rest } = user;

    return {
      ...toAdminUserSummary(rest),
      bio: rest.bio,
      exp: rest.exp,
      warnings,
    };
  }

  /**
   * Cảnh báo tài khoản: ghi `UserWarning`, tăng `warningCount`.
   * Đủ 3 cảnh báo → tự khoá (`BANNED`); `JwtAuthGuard` và login đã chặn tài khoản bị khoá.
   */
  async warn(userId: string, adminId: string, reason: string): Promise<AdminUserDetail> {
    if (userId === adminId) {
      throw new BadRequestException('Không thể tự gửi cảnh báo cho chính mình');
    }

    const target = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true, role: true, status: true, warningCount: true },
    });

    if (!target) {
      throw new NotFoundException('Không tìm thấy tài khoản');
    }

    if (target.role === Role.ADMIN) {
      throw new BadRequestException('Không thể gửi cảnh báo cho tài khoản quản trị');
    }

    if (target.status === 'BANNED') {
      throw new ConflictException('Tài khoản đã bị khoá, không gửi cảnh báo thêm được');
    }

    const nextCount = target.warningCount + 1;

    await this.prisma.$transaction([
      this.prisma.userWarning.create({ data: { reason: reason.trim(), userId, adminId } }),
      this.prisma.user.update({
        where: { id: userId },
        data: {
          warningCount: nextCount,
          status: nextCount >= 3 ? 'BANNED' : 'WARNED',
        },
      }),
    ]);

    return this.findDetailForAdmin(userId);
  }

  private async update(userId: string, data: Prisma.UserUpdateInput): Promise<SelfProfile> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data,
      select: SELF_PROFILE_SELECT,
    });

    return user as SelfProfile;
  }
}

function toAdminUserSummary(user: {
  id: string;
  email: string;
  fullName: string;
  studentCode: string | null;
  avatarUrl: string | null;
  role: string;
  status: string;
  warningCount: number;
  level: number;
  emailVerifiedAt: Date | null;
  createdAt: Date;
  _count: { documents: number };
}): AdminUserSummary {
  const { _count, ...rest } = user;
  return { ...rest, documentCount: _count.documents };
}

/** Prisma ném P2002 khi vi phạm unique; nhận diện mà không phụ thuộc class cụ thể. */
function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}
