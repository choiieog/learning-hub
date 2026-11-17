# modules/notifications

Thông báo trong app: kết quả duyệt/từ chối/xoá bài, cảnh báo tài khoản, tin chung của admin.

## Đang có

Sinh viên (`JwtAuthGuard`):

- `GET /api/notifications?page&limit&unreadOnly` — tin cá nhân + tin chung, mới nhất trước, kèm `unreadCount`.
  Mỗi item có `userId` (`null` = tin chung) để client biết tin nào mình được xoá.
- `PATCH /api/notifications/:id/read` — đánh dấu 1 tin đã đọc.
- `PATCH /api/notifications/read-all` — đánh dấu tất cả tin chưa đọc của mình.
- `DELETE /api/notifications/:id` — xoá **thông báo cá nhân của mình**; tin chung trả 403 (chỉ admin thu hồi).

Admin (`RolesGuard`, `ADMIN`):

- `POST /api/admin/notifications/broadcast` — gửi tin chung (`userId = null`).
- `GET /api/admin/notifications` — tin chung đã gửi, mới nhất trước.
- `DELETE /api/admin/notifications/:id` — thu hồi tin chung; `NotificationRead` của mọi người bị xoá theo cascade.

Nguồn tạo tin: `approve()`, `reject()`, `removeByAdmin()`, `warn()` (cảnh báo tài khoản), `broadcast()`.

## Quy ước

- Tin cá nhân: 1 row/người, trạng thái đọc nằm ở `Notification.readAt`.
- Tin chung: 1 row dùng chung (`userId = null`) nên trạng thái đọc tách sang `NotificationRead(userId, notificationId)`;
  badge trên `UserLayout` và trang `/notifications` dùng chung một signal (`NotificationStateService`).
- Prune (`npm run db:prune`): tin chung cũ hơn `NOTIFICATION_READ_RETENTION_DAYS` bị xoá cùng read row;
  tin cá nhân **đã đọc** cũ hơn `PERSONAL_NOTIFICATION_RETENTION_DAYS` bị xoá, tin chưa đọc luôn giữ.
