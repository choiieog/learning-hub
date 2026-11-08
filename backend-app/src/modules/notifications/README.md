# modules/notifications

Thông báo trong app — **đã triển khai** cho luồng duyệt bài (làm sớm từ giai đoạn 2).

## Đang có

- `DocumentsService.approve()` → tạo `Notification` type `DOCUMENT_APPROVED`
  (message: "“<title>” đã được duyệt và hiển thị công khai với mọi sinh viên.", `link = /documents/<id>`).
- `DocumentsService.reject(id, reason)` → tạo `Notification` type `DOCUMENT_REJECTED`, message kèm `Lý do: <reason>`.
- `GET /api/notifications?page&limit&unreadOnly` — thông báo của tôi, mới nhất trước, trả kèm `unreadCount`.
- `PATCH /api/notifications/:id/read` — đánh dấu 1 tin đã đọc (`readAt`), 404 nếu không phải thông báo của mình.
- `PATCH /api/notifications/read-all` — đánh dấu tất cả tin cá nhân chưa đọc của mình.

Tất cả endpoint đều sau `JwtAuthGuard` (khách chưa đăng nhập → 401).

## Quy ước

- `readAt IS NULL` = chưa đọc; badge trên `UserLayout` dùng `unreadCount`.
- `Notification.userId = null` là thông báo chung (broadcast) — hiển thị cho mọi người nhưng **chưa có trạng thái đọc riêng**
  (vì vậy `markRead` trả 404 cho broadcast, không đánh dấu đọc được).
- Không thêm migration: model `Notification` + enum `NotificationType` đã có trong `schema.prisma`.

## Còn thiếu

- `POST /api/admin/notifications/broadcast` — gửi thông báo chung (`userId = null`).
- Thông báo khi admin **xoá** bài.
- Trang danh sách thông báo đầy đủ (hiện chỉ có dropdown 8 tin gần nhất ở header).
- Trạng thái đọc cho broadcast (cần bảng `NotificationRead` hoặc nhân bản theo user).
