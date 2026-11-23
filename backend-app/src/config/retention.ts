/**
 * Số ngày retention đọc từ env. Thiếu biến, chuỗi rỗng, `0`, số âm hoặc không phải số thì
 * dùng mặc định — cấu hình sai không được phép biến job dọn dữ liệu thành "xoá tất cả".
 * (`Number('') === 0` nên env rỗng cũng rơi về mặc định.)
 */
export function retentionDays(
  value: string | undefined,
  fallback: number,
): number {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
