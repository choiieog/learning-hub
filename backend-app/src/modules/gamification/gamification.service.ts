import { Injectable, NotFoundException } from '@nestjs/common';
import { TRANSACTION_OPTIONS } from '../../common/constants/transaction.constants';
import { ExpReason, Prisma, Role } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { LevelProgress, levelFromExp, levelProgress } from './gamification.constants';

const LEADERBOARD_USER_SELECT = {
  id: true,
  fullName: true,
  avatarUrl: true,
  level: true,
  exp: true,
} satisfies Prisma.UserSelect;

export interface AwardInput {
  userId: string;
  delta: number;
  reason: ExpReason;
  /** id tài liệu / đánh giá liên quan, để đối soát trong ExpLog. */
  refId?: string | null;
}

export interface AwardResult {
  exp: number;
  level: number;
  delta: number;
  leveledUp: boolean;
}

export interface LeaderboardEntry extends LevelProgress {
  rank: number;
  id: string;
  fullName: string;
  avatarUrl: string | null;
}

export interface LeaderboardResponse {
  items: LeaderboardEntry[];
  total: number;
  meta: { page: number; limit: number; total: number; totalPages: number };
  /** Vị trí + tiến độ của người gọi; null nếu tài khoản không còn tồn tại. */
  me: LeaderboardEntry | null;
}

/**
 * Level / EXP / bảng xếp hạng.
 *
 * EXP được cộng theo sự kiện (xem tài liệu, nhận đánh giá mới, bài được duyệt) để
 * mỗi lần cộng đều có một dòng `ExpLog` đối soát được. `User.exp` là tổng luỹ kế,
 * `User.level` suy ra từ tổng đó (không cộng dồn riêng), nên luôn tự sửa nếu dữ liệu lệch.
 */
@Injectable()
export class GamificationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Cộng (hoặc trừ, nếu delta âm) EXP và cập nhật level trong cùng transaction.
   * Truyền `tx` khi được gọi từ transaction khác (duyệt bài, đánh giá) để EXP
   * không commit lệch với nghiệp vụ chính.
   */
  async award(input: AwardInput, tx?: Prisma.TransactionClient): Promise<AwardResult> {
    const { userId, delta, reason, refId = null } = input;

    const apply = async (db: Prisma.TransactionClient): Promise<AwardResult> => {
      await db.expLog.create({ data: { userId, delta, reason, refId } });

      const updated = await db.user.update({
        where: { id: userId },
        data: { exp: { increment: delta } },
        select: { exp: true, level: true },
      });

      const exp = Math.max(0, updated.exp);
      const level = levelFromExp(exp);

      if (level !== updated.level) {
        await db.user.update({ where: { id: userId }, data: { level } });
      }

      return { exp, level, delta, leveledUp: level > updated.level };
    };

    try {
      return tx
        ? await apply(tx)
        : await this.prisma.$transaction((inner) => apply(inner), TRANSACTION_OPTIONS);
    } catch (error) {
      // Tài khoản đã bị xoá cứng giữa chừng: bỏ qua thay vì làm hỏng request chính.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException('Không tìm thấy người dùng để cộng EXP');
      }

      throw error;
    }
  }

  /** Một trang top sinh viên theo EXP + vị trí hiện tại của người gọi. */
  async leaderboard(viewerId: string, page = 1, limit = 10): Promise<LeaderboardResponse> {
    const take = Math.min(50, Math.max(1, limit));
    const currentPage = Math.max(1, page);
    const skip = (currentPage - 1) * take;
    const where: Prisma.UserWhereInput = { role: Role.USER, deletedAt: null };

    // Một transaction chỉ-đọc giữ các truy vấn trên cùng một connection, tránh lỗi
    // giao thức của Prisma Dev khi nhiều người mở bảng xếp hạng cùng lúc.
    return this.prisma.$transaction(async (tx) => {
      const users = await tx.user.findMany({
        where,
        orderBy: [{ exp: 'desc' }, { level: 'desc' }, { createdAt: 'asc' }],
        skip,
        take,
        select: LEADERBOARD_USER_SELECT,
      });
      const total = await tx.user.count({ where });
      const viewer = await tx.user.findUnique({
        where: { id: viewerId },
        select: LEADERBOARD_USER_SELECT,
      });

      // Hạng là vị trí tuyệt đối trên bảng, không phải thứ tự trong trang.
      const items: LeaderboardEntry[] = users.map((user, index) => ({
        rank: skip + index + 1,
        ...user,
        ...levelProgress(user.exp),
      }));

      let me: LeaderboardEntry | null = null;
      if (viewer) {
        const rank =
          1 +
          (await tx.user.count({
            where: { ...where, exp: { gt: viewer.exp } },
          }));

        me = { rank, ...viewer, ...levelProgress(viewer.exp) };
      }

      return {
        items,
        total,
        meta: { page: currentPage, limit: take, total, totalPages: Math.ceil(total / take) },
        me,
      };
    }, TRANSACTION_OPTIONS);
  }
}
