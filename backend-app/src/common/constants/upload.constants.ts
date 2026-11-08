/** Hằng số dùng chung cho upload file (controller, service, main.ts). */

/** Đường dẫn tĩnh phục vụ file đã upload — đi qua proxy /api của frontend. */
export const UPLOAD_URL_PREFIX = '/api/files';

/** Thư mục con hợp lệ trong UPLOAD_DIR; không nhận path từ client. */
export const UPLOAD_FOLDERS = ['documents', 'avatars'] as const;
export type UploadFolder = (typeof UPLOAD_FOLDERS)[number];

/** Định dạng cho phép → MIME type chuẩn (dùng để kiểm tra file thật). */
export const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

/** Dung lượng tối đa mỗi file (mặc định 20MB) — đọc từ MAX_UPLOAD_SIZE_MB. */
export function maxUploadSizeBytes(): number {
  const megabytes = Number(process.env.MAX_UPLOAD_SIZE_MB ?? 20);
  const safeMegabytes = Number.isFinite(megabytes) && megabytes > 0 ? megabytes : 20;

  return Math.round(safeMegabytes * 1024 * 1024);
}
