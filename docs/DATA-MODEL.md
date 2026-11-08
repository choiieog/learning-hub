# Mô hình dữ liệu

Thiết kế đầy đủ cho cả giai đoạn 1 và phần "phát triển sau", để không phải migrate lại cấu trúc lớn về sau.
Schema chuẩn nằm ở [backend-app/prisma/schema.prisma](../backend-app/prisma/schema.prisma).

## Quan hệ chính

```
User 1─n Document          (người đăng)
User 1─n EmailVerificationToken (token xác thực email, lưu hash)
User 1─n PasswordResetToken (token đặt lại mật khẩu, lưu hash, hạn 1h, dùng 1 lần)
Subject 1─n Document       (mỗi tài liệu thuộc 1 môn học)
Document 1─n DocumentFile  (1–3 file đính kèm: pdf/docx/pptx)
Document 1─n DocumentView  (log lượt xem, dedupe theo người + ngày)
Document 1─n Rating        (đánh giá sao — phase 2)
User 1─n UserWarning       (admin cảnh báo tài khoản)
User 1─n Notification      (thông báo duyệt/từ chối — đã dùng; `userId = null` là thông báo chung, phase 2)
User 1─n ExpLog            (lịch sử cộng EXP — phase 2)
AvatarFrame 1─n User       (khung avatar mở theo level — phase 2)
```

## Bảng & mục đích

| Model | Mục đích | Giai đoạn |
| --- | --- | --- |
| `User` | Tài khoản, role, hồ sơ, `level`/`exp`, `warningCount`, `emailVerifiedAt` | 1 |
| `EmailVerificationToken` | Token xác thực email (hash, hạn 24h, `usedAt`) | 1 |
| `PasswordResetToken` | Token đặt lại mật khẩu (hash, hạn 1h, `usedAt`; dùng 1 lần, link mới vô hiệu hoá link cũ) | 1 |
| `Subject` | Danh mục môn học (`code`, `name`, `documentCount` cache) | 1 |
| `Document` | Bài viết/tài liệu: `status`, `viewCount`, `ratingAvg`, `deletedAt` | 1 |
| `DocumentFile` | File đính kèm (url, tên, size, mime) | 1 |
| `DocumentView` | Chống spam view: unique `(documentId, viewerKey, dayKey)` | 1 |
| `UserWarning` | Cảnh báo tài khoản của admin | 1 |
| `Rating` | Đánh giá 1–5 sao, unique `(documentId, userId)` | 2 |
| `Notification` | Thông báo duyệt/từ chối + thông báo chung (`userId = null`) | 1 (một phần): duyệt/từ chối + đọc tin đã dùng; broadcast/xoá bài còn ở giai đoạn 2 |
| `ExpLog` | Lịch sử cộng EXP (audit + hiển thị "hoạt động") | 2 |
| `AvatarFrame` | Khung avatar theo level | 2 |
| `SystemSetting` | Bật/tắt hoặc giới hạn số bài đăng | 2 |

## Ghi chú thiết kế

- **Đếm view:** `Document.viewCount` là counter để sort/lọc nhanh. Nguồn sự thật là `DocumentView`:
  `viewerKey = userId`, `dayKey = YYYY-MM-DD` (giờ Việt Nam, `common/utils/day-key.util.ts`)
  → một user chỉ được tính 1 view/tài liệu/ngày, reset lúc 00:00 giờ Việt Nam.
  Khách không xem được chi tiết tài liệu nên không có view ẩn danh (không cần hash IP).
- **Xác thực email:** `User.emailVerifiedAt = null` → chưa kích hoạt, login trả 403 `EMAIL_NOT_VERIFIED`.
  Token chỉ lưu dạng hash (`tokenHash`), hạn 24h, dùng 1 lần (`usedAt`); xác thực xong thì set `emailVerifiedAt`.
- **Một tài liệu = một môn:** `Document.subjectId` là khoá ngoại đơn; xoá môn học bị chặn khi còn tài liệu chưa xoá mềm.
- **Duyệt bài:** `status` mặc định `PENDING`; `publishedAt` set khi admin duyệt; `rejectReason` khi từ chối.
- **Xóa mềm:** `deletedAt` cho cả `Document` và `User`; truy vấn public luôn lọc `deletedAt: null`.
- **Điểm sao:** lưu cache `ratingAvg` + `ratingCount` trên `Document` khi có rating mới (phase 2).
- **Level/EXP:** tính lại sau mỗi sự kiện (view mới, rating mới) và ghi `ExpLog`; `User.level` + `User.exp` phục vụ bảng xếp hạng trên trang tổng quan.
- Đổi sang MySQL: chỉ sửa `provider = "mysql"` và bỏ các `@db.Text`/`@db.VarChar` không tương thích.
