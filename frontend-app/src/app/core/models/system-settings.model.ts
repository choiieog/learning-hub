/** Kết quả GET/PATCH /api/admin/settings */
export interface SystemSettings {
  /** `false` = admin đang tạm khoá, sinh viên không đăng được bài mới. */
  uploadsEnabled: boolean;
  updatedAt?: string | null;
}
