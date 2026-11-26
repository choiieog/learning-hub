export interface Subject {
  id: string;
  code: string;
  name: string;
  /** Số tài liệu đã duyệt — dùng cho bộ lọc công khai. */
  documentCount: number;
}

export interface CreateSubjectPayload {
  code: string;
  name: string;
}
