# modules/settings — cấu hình hệ thống

Bảng `SystemSetting` (key/value JSON), admin đọc/ghi qua API, nghiệp vụ đọc ngay khi cần.

- `GET /api/admin/settings` (ADMIN) — `{ documentDailyLimit, updatedAt }`.
- `PATCH /api/admin/settings` (ADMIN) — body `{ documentDailyLimit: 0..50 }`; **0 = không giới hạn**.
- `DocumentsService.create` gọi `SettingsService.getDocumentDailyLimit()` **mỗi lần đăng bài**:
  đếm số tài liệu tác giả đã tạo từ 00:00 giờ Việt Nam; đạt giới hạn → **429** kèm số đã đăng.
  Bài đã xoá mềm vẫn tính (mục tiêu là chống spam, không phải tiết kiệm quota).
- Đọc thẳng DB mỗi request (một query nhỏ) để nhiều instance luôn thấy cùng cấu hình; đổi là áp dụng ngay.

Khoá cấu hình nằm ở `settings.constants.ts` (`SETTING_KEYS.DOCUMENT_DAILY_LIMIT = 'document.dailyLimit'`),
giá trị lạ/thiếu thì rơi về mặc định 0 để không chặn đăng bài ngoài ý muốn.

Mở rộng sau: `document.uploadsEnabled` (tắt đăng bài), `document.requireApproval` — thêm khoá + field DTO
và đọc trong `DocumentsService`/`AdminDocumentsController`; UI `/admin/settings` thêm công tắc tương ứng.

Frontend: trang `/admin/settings` (`features/admin/pages/admin-settings`), `AdminService.settings()` +
`updateSettings()`.
