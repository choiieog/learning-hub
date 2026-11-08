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

/**
 * Chữ ký nhị phân đầu file — chặn file đổi đuôi dù client khai MIME giả.
 * DOCX/PPTX đều là ZIP nên chỉ phân biệt được ở mức "là ZIP hợp lệ";
 * phần mở rộng vẫn do người dùng chọn nhưng nội dung không thể là .exe.
 */
const ZIP_SIGNATURES = [
  [0x50, 0x4b, 0x03, 0x04],
  [0x50, 0x4b, 0x05, 0x06],
  [0x50, 0x4b, 0x07, 0x08],
];

function startsWithBytes(buffer: Buffer, signature: number[]): boolean {
  return (
    buffer.length >= signature.length && signature.every((byte, index) => buffer[index] === byte)
  );
}

/** Nội dung file có đúng chữ ký của định dạng `extension` không. */
export function matchesFileSignature(extension: string, buffer: Buffer): boolean {
  switch (extension) {
    case 'pdf':
      // %PDF
      return startsWithBytes(buffer, [0x25, 0x50, 0x44, 0x46]);
    case 'docx':
    case 'pptx':
      return ZIP_SIGNATURES.some((signature) => startsWithBytes(buffer, signature));
    case 'png':
      return startsWithBytes(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case 'jpg':
    case 'jpeg':
      return startsWithBytes(buffer, [0xff, 0xd8, 0xff]);
    case 'webp':
      return (
        buffer.subarray(0, 4).toString('latin1') === 'RIFF' &&
        buffer.subarray(8, 12).toString('latin1') === 'WEBP'
      );
    default:
      return false;
  }
}

/** Dung lượng tối đa mỗi file (mặc định 20MB) — đọc từ MAX_UPLOAD_SIZE_MB. */
export function maxUploadSizeBytes(): number {
  const megabytes = Number(process.env.MAX_UPLOAD_SIZE_MB ?? 20);
  const safeMegabytes = Number.isFinite(megabytes) && megabytes > 0 ? megabytes : 20;

  return Math.round(safeMegabytes * 1024 * 1024);
}
