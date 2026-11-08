/** Điểm EXP cho từng hành động — nguồn sự thật duy nhất cho cả service và tài liệu. */
export const EXP_RULES = {
  /** Mỗi lượt xem hợp lệ (1 người / tài liệu / ngày) cộng cho tác giả. */
  VIEW: 1,
  /** Mỗi đánh giá mới (không tính khi sửa lại đánh giá cũ). */
  RATING: 5,
  /** Bài được admin duyệt. */
  DOCUMENT_APPROVED: 20,
} as const;

/** EXP cần để đạt `level`, tính luỹ kế từ level 1 (level 1 = 0 EXP). */
export function expToReachLevel(level: number): number {
  let total = 0;
  for (let current = 1; current < Math.max(1, level); current += 1) {
    total += levelStep(current);
  }

  return total;
}

/** EXP của một bậc: round(100 * level^1.5) — xem docs/DECISIONS.md mục 10. */
export function levelStep(level: number): number {
  return Math.round(100 * Math.pow(level, 1.5));
}

/** Suy ra level từ tổng EXP. */
export function levelFromExp(exp: number): number {
  let level = 1;
  let remaining = Math.max(0, exp);
  let step = levelStep(level);

  while (remaining >= step) {
    remaining -= step;
    level += 1;
    step = levelStep(level);
  }

  return level;
}

export interface LevelProgress {
  level: number;
  exp: number;
  /** EXP đã tích luỹ trong level hiện tại. */
  levelExp: number;
  /** EXP cần để lên level tiếp theo (của riêng bậc hiện tại). */
  levelStep: number;
  /** Còn bao nhiêu EXP nữa thì lên level. */
  remaining: number;
  progressPercent: number;
}

/** Tiến độ trong level hiện tại, dùng cho thanh progress ở UI. */
export function levelProgress(exp: number): LevelProgress {
  const total = Math.max(0, exp);
  const level = levelFromExp(total);
  const floor = expToReachLevel(level);
  const step = levelStep(level);
  const levelExp = total - floor;
  const progressPercent = step > 0 ? Math.min(100, Math.floor((levelExp / step) * 100)) : 0;

  return {
    level,
    exp: total,
    levelExp,
    levelStep: step,
    remaining: Math.max(0, step - levelExp),
    progressPercent,
  };
}
