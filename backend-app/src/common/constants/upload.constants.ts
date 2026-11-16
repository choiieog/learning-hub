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
 * DOCX/PPTX đều là ZIP; ngoài chữ ký ZIP còn phải có entry đặc trưng của
 * Word/PowerPoint (xem `matchesOfficeContainer`) để một file .zip đổi tên
 * thành .docx không lọt qua.
 */
const ZIP_SIGNATURES = [
  [0x50, 0x4b, 0x03, 0x04],
  [0x50, 0x4b, 0x05, 0x06],
  [0x50, 0x4b, 0x07, 0x08],
];

/** Entry bắt buộc phải có trong container OOXML. */
const OFFICE_REQUIRED_ENTRY: Record<'docx' | 'pptx', string> = {
  docx: 'word/document.xml',
  pptx: 'ppt/presentation.xml',
};

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIR_SIGNATURE = 0x02014b50;
/** 64KB cuối là vùng EOCD có thể nằm trong (comment ZIP tối đa 64KB). */
const EOCD_SEARCH_WINDOW = 66_000;
const MAX_ENTRIES_TO_READ = 512;

/**
 * Đọc danh sách tên entry từ central directory của file ZIP (không giải nén).
 * Trả mảng rỗng nếu file không phải ZIP hợp lệ — khi đó lời gọi kiểm tra sẽ fail.
 */
function readZipEntryNames(buffer: Buffer): string[] {
  const minEocdOffset = Math.max(0, buffer.length - EOCD_SEARCH_WINDOW);
  let eocdOffset = -1;

  for (let offset = buffer.length - 22; offset >= minEocdOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) {
      eocdOffset = offset;
      break;
    }
  }

  if (eocdOffset < 0) {
    return [];
  }

  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
  let entryOffset = buffer.readUInt32LE(eocdOffset + 16);
  const names: string[] = [];

  for (let index = 0; index < Math.min(totalEntries, MAX_ENTRIES_TO_READ); index += 1) {
    if (
      entryOffset + 46 > buffer.length ||
      buffer.readUInt32LE(entryOffset) !== CENTRAL_DIR_SIGNATURE
    ) {
      break;
    }

    const nameLength = buffer.readUInt16LE(entryOffset + 28);
    const extraLength = buffer.readUInt16LE(entryOffset + 30);
    const commentLength = buffer.readUInt16LE(entryOffset + 32);
    const nameStart = entryOffset + 46;

    if (nameStart + nameLength > buffer.length) {
      break;
    }

    names.push(buffer.subarray(nameStart, nameStart + nameLength).toString('utf8'));
    entryOffset = nameStart + nameLength + extraLength + commentLength;
  }

  return names;
}

/**
 * File có đúng là container Word/PowerPoint không: chữ ký ZIP + entry đặc trưng.
 * Không giải nén nội dung nên không có rủi ro zip bomb.
 */
export function matchesOfficeContainer(extension: 'docx' | 'pptx', buffer: Buffer): boolean {
  if (!ZIP_SIGNATURES.some((signature) => startsWithBytes(buffer, signature))) {
    return false;
  }

  return readZipEntryNames(buffer).includes(OFFICE_REQUIRED_ENTRY[extension]);
}

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
      return matchesOfficeContainer(extension, buffer);
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
