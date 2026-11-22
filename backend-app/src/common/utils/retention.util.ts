const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Mốc cắt `days` ngày trước `now`. Một nguồn duy nhất cho mọi job dọn dữ liệu theo tuổi,
 * để prune script và từng phần việc không lệch nhau về cách tính "một ngày".
 */
export function cutoffBefore(days: number, now: Date = new Date()): Date {
  return new Date(now.getTime() - days * DAY_MS);
}
