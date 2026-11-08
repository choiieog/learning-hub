import { Subject } from './subject.model';

export type DocumentStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface DocumentAuthor {
  id: string;
  fullName: string;
  avatarUrl?: string;
  avatarFrameUrl?: string;
  level: number;
}

export interface DocumentFile {
  url: string;
  publicId?: string;
  name: string;
  /** bytes */
  size: number;
  mimeType: string;
}

export interface DocumentSummary {
  id: string;
  title: string;
  description?: string;
  status: DocumentStatus;
  subject: Pick<Subject, 'id' | 'code' | 'name'>;
  author: DocumentAuthor;
  files: DocumentFile[];
  viewCount: number;
  ratingAvg: number;
  ratingCount: number;
  createdAt: string;
  publishedAt?: string;
}

/** Tài liệu của chính người dùng — kèm lý do từ chối do admin gửi. */
export interface MyDocumentSummary extends DocumentSummary {
  rejectReason?: string | null;
}

export interface DocumentDetail extends DocumentSummary {
  /** markdown tùy chọn */
  content?: string;
  /** chỉ hiển thị cho chủ bài / admin */
  rejectReason?: string;
  /** true khi lượt xem lần này được tính; false khi hôm nay đã tính rồi */
  viewCountedToday?: boolean;
}

/** Query cho danh sách tài liệu — mảng sẽ được gửi thành tham số lặp lại */
export interface DocumentListQuery {
  keyword?: string;
  subjectIds?: string[];
  authorIds?: string[];
  fileTypes?: string[];
  minRating?: number;
  page?: number;
  limit?: number;
  /** createdAt:desc | viewCount:desc | ratingAvg:desc */
  sort?: string;
}

export interface CreateDocumentPayload {
  title: string;
  description?: string;
  content?: string;
  subjectId: string;
  files: DocumentFile[];
}

/** Body của PATCH /api/documents/:id — sửa bài bị từ chối rồi gửi duyệt lại */
export interface ResubmitDocumentPayload {
  title: string;
  description?: string;
  content?: string;
  subjectId: string;
  /** Bỏ trống để giữ file cũ; gửi lên để thay toàn bộ file đính kèm */
  files?: DocumentFile[];
}

/** Query cho danh sách "Đã chia sẻ" của người dùng */
export interface MyDocumentsQuery extends DocumentListQuery {
  status?: DocumentStatus;
}

/** Query cho hàng chờ duyệt của admin */
export interface ModerationQuery extends DocumentListQuery {
  status?: DocumentStatus;
}
