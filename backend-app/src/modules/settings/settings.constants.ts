/** Khoá cấu hình trong bảng `SystemSetting` (key/value JSON). */
export const SETTING_KEYS = {
  DOCUMENT_DAILY_LIMIT: 'document.dailyLimit',
} as const;

/** 0 = không giới hạn (mặc định, giữ hành vi cũ). */
export const DEFAULT_DOCUMENT_DAILY_LIMIT = 0;

/** Chặn cấu hình vô lý; đủ rộng cho nhu cầu thực tế. */
export const MAX_DOCUMENT_DAILY_LIMIT = 50;
