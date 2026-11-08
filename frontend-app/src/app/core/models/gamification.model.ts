/** Tiến độ EXP trong level hiện tại. */
export interface LevelProgress {
  level: number;
  exp: number;
  /** EXP đã tích luỹ trong level hiện tại. */
  levelExp: number;
  /** EXP cần để lên level tiếp theo (của riêng bậc hiện tại). */
  levelStep: number;
  remaining: number;
  progressPercent: number;
}

export interface LeaderboardEntry extends LevelProgress {
  rank: number;
  id: string;
  fullName: string;
  avatarUrl?: string | null;
}

/** Kết quả GET /api/leaderboard — `me` là vị trí của người đang đăng nhập. */
export interface LeaderboardResponse {
  items: LeaderboardEntry[];
  total: number;
  me: LeaderboardEntry | null;
}
