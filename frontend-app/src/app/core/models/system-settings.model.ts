/** Kết quả GET/PATCH /api/admin/settings */
export interface SystemSettings {
  /** Số tài liệu tối đa mỗi sinh viên được đăng trong một ngày; 0 = không giới hạn. */
  documentDailyLimit: number;
  updatedAt?: string | null;
}
