/** Khoá cấu hình trong bảng `SystemSetting` (key/value JSON). */
export const SETTING_KEYS = {
  DOCUMENT_UPLOADS_ENABLED: 'document.uploadsEnabled',
} as const;

/** Chưa có cấu hình trong DB = vẫn cho đăng bài (giữ hành vi mặc định). */
export const DEFAULT_DOCUMENT_UPLOADS_ENABLED = true;
