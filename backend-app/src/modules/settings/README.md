# modules/settings (phase 2)

Cấu hình hệ thống (bảng `SystemSetting`, key/value JSON).

- `GET /api/admin/settings`
- `PATCH /api/admin/settings` — vd: `{ "documents.enabled": true, "documents.maxPerDay": 5, "documents.requireApproval": true }`
- Đọc cấu hình trong `DocumentsService.create` để chặn khi admin tắt đăng bài hoặc vượt giới hạn/ngày
- Cache cấu hình trong memory (Ttl) để không query DB mỗi request
