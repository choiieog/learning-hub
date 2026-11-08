/** Kết quả POST /api/uploads */
export interface StoredFile {
  url: string;
  publicId?: string;
  name: string;
  /** bytes */
  size: number;
  mimeType: string;
}

export type UploadFolder = 'documents' | 'avatars';
