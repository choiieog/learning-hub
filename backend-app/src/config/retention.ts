/** Cửa sổ retention của bốn bảng trong job dọn dữ liệu, tính bằng ngày. */
export interface RetentionWindows {
  documentViewDays: number;
  notificationReadDays: number;
  personalNotificationDays: number;
  expLogDays: number;
}

type RetentionEnv = Partial<
  Record<
    | 'DOCUMENT_VIEW_RETENTION_DAYS'
    | 'NOTIFICATION_READ_RETENTION_DAYS'
    | 'PERSONAL_NOTIFICATION_RETENTION_DAYS'
    | 'EXP_LOG_RETENTION_DAYS',
    string
  >
>;

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

/**
 * Nối từng biến env vào đúng cửa sổ của nó. Tách khỏi script để test được việc hoán đổi
 * hai biến (ví dụ view ↔ exp) mà không cần import một file có `main()` chạy ngay.
 */
export function retentionWindowsFromEnv(
  env: RetentionEnv = process.env,
): RetentionWindows {
  return {
    documentViewDays: retentionDays(env.DOCUMENT_VIEW_RETENTION_DAYS, 180),
    notificationReadDays: retentionDays(
      env.NOTIFICATION_READ_RETENTION_DAYS,
      180,
    ),
    personalNotificationDays: retentionDays(
      env.PERSONAL_NOTIFICATION_RETENTION_DAYS,
      180,
    ),
    expLogDays: retentionDays(env.EXP_LOG_RETENTION_DAYS, 180),
  };
}
