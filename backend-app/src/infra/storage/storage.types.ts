import type { UploadFolder } from '../../common/constants/upload.constants';

/**
 * File handed to the storage layer: already validated by `UploadsService`
 * (extension, MIME type and size), so drivers only move bytes.
 */
export interface StorageUploadInput {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
}

/** What a driver returns; `Document.files` and `User.avatarUrl` store these fields as-is. */
export interface StoredFile {
  /** Dùng được ngay trong <a href> / <img src> (đi qua proxy /api). */
  url: string;
  /** Khoá trên storage để xoá file sau này: "<folder>/<tên-file>". */
  publicId: string;
  name: string;
  size: number;
  mimeType: string;
}

/** Một nơi lưu file (local disk, Cloudinary, S3…). */
export interface StorageDriver {
  /** Giá trị của `STORAGE_DRIVER`, dùng cho log và thông báo lỗi cấu hình. */
  readonly name: string;
  upload(input: StorageUploadInput, folder: UploadFolder): Promise<StoredFile>;
  remove(publicId: string): Promise<void>;
}

/** Injection token của driver đang bật. */
export const STORAGE_DRIVER = Symbol('STORAGE_DRIVER');
