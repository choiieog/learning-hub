const VIETNAM_TIME_ZONE = 'Asia/Ho_Chi_Minh';

const DAY_KEY_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  timeZone: VIETNAM_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * Khoá ngày theo giờ Việt Nam (UTC+7): "2026-11-06".
 *
 * Dùng làm `DocumentView.dayKey` để lượt xem được tính lại lúc 00:00 giờ Việt Nam
 * thay vì 07:00 như khi dùng ngày UTC. Dùng `Intl` thay vì tự cộng 7 giờ để không
 * phụ thuộc múi giờ cấu hình trên máy chủ chạy code.
 */
export function vietnamDayKey(date: Date = new Date()): string {
  const parts = DAY_KEY_FORMATTER.formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';

  return `${value('year')}-${value('month')}-${value('day')}`;
}
