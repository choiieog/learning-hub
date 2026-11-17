# modules/settings — cấu hình hệ thống

Bảng `SystemSetting` (key/value JSON), admin đọc/ghi qua API, nghiệp vụ đọc ngay khi cần.

- `GET /api/admin/settings` (ADMIN) — `{ uploadsEnabled, updatedAt }`.
- `PATCH /api/admin/settings` (ADMIN) — body `{ uploadsEnabled: boolean }`.
- `DocumentsService.create` gọi `SettingsService.isUploadEnabled()` **mỗi lần đăng bài**:
  tắt → **403** `"Hiện tại hệ thống đang tạm khoá đăng tài liệu."`; bật lại là đăng được ngay.
- Đọc thẳng DB mỗi request (một query nhỏ) để nhiều instance luôn thấy cùng cấu hình.

Khoá cấu hình nằm ở `settings.constants.ts` (`SETTING_KEYS.DOCUMENT_UPLOADS_ENABLED = 'document.uploadsEnabled'`),
thiếu khoá hoặc giá trị lạ thì rơi về mặc định **bật** để không khoá đăng bài ngoài ý muốn.

Khoá cũ `document.dailyLimit` (giới hạn số bài/ngày) đã bỏ — dòng còn sót trong DB không được
đọc nữa, xoá tay nếu muốn gọn.

Mở rộng sau: `document.requireApproval` — thêm khoá + field DTO và đọc trong `DocumentsService`;
UI `/admin/settings` thêm công tắc tương ứng.
