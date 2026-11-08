import { Injectable, NotFoundException } from '@nestjs/common';
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

  /** Cộng (hoặc trừ, nếu delta âm) EXP và cập nhật level trong cùng transaction. */
  async award(input: AwardInput): Promise<AwardResult> {
    const { userId, delta, reason, refId = null } = input;

    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.expLog.create({ data: { userId, delta, reason, refId } });

        const updated = await tx.user.update({
          where: { id: userId },
          data: { exp: { increment: delta } },
          select: { exp: true, level: true },
        });

        const exp = Math.max(0, updated.exp);
        const level = levelFromExp(exp);

        if (level !== updated.level) {
          await tx.user.update({ where: { id: userId }, data: { level } });
        }

        return { exp, level, delta, leveledUp: level > updated.level };
      });
    } catch (error) {
      // Tài khoản đã bị xoá cứng giữa chừng: bỏ qua thay vì làm hỏng request chính.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException('Không tìm thấy người dùng để cộng EXP');
      }

      throw error;
    }
  }

  /** Top sinh viên theo EXP + vị trí hiện tại của người gọi. */
  async leaderboard(viewerId: string, limit = 10): Promise<LeaderboardResponse> {
    const take = Math.min(50, Math.max(1, limit));
    const where: Prisma.UserWhereInput = { role: Role.USER, deletedAt: null };

    const [users, total, viewer] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: [{ exp: 'desc' }, { level: 'desc' }, { createdAt: 'asc' }],
        take,
        select: LEADERBOARD_USER_SELECT,
      }),
      this.prisma.user.count({ where }),
      this.prisma.user.findUnique({
        where: { id: viewerId },
        select: LEADERBOARD_USER_SELECT,
      }),
    ]);

    const items: LeaderboardEntry[] = users.map((user, index) => ({
      rank: index + 1,
      ...user,
      ...levelProgress(user.exp),
    }));

    let me: LeaderboardEntry | null = null;
    if (viewer) {
      const rank =
        1 +
        (await this.prisma.user.count({
          where: { ...where, exp: { gt: viewer.exp } },
        }));

      me = { rank, ...viewer, ...levelProgress(viewer.exp) };
    }

    return { items, total, me };
  }
}
