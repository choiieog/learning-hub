# Quy ước API

Base URL: `http://localhost:3000/api`

## Response envelope

Mọi response đi qua `ResponseInterceptor` (thành công) và `HttpExceptionFilter` (lỗi):

```json
{ "success": true, "data": { }, "timestamp": "2026-11-04T08:00:00.000Z" }
```

```json
{ "success": false, "statusCode": 404, "message": "Không tìm thấy tài liệu", "path": "/api/documents/abc", "timestamp": "..." }
```

## Phân trang

Request: `?page=1&limit=10&sort=createdAt:desc`

```json
{ "items": [], "meta": { "page": 1, "limit": 10, "total": 0, "totalPages": 0 } }
```

## Lọc nhiều lựa chọn

Tham số mảng gửi lặp lại key (Angular `toHttpParams` trong `core/utils/http-params.util.ts` đã hỗ trợ):

```
GET /api/documents?subjectIds=a&subjectIds=b&authorIds=u1&fileTypes=pdf&keyword=giải%20tích&sort=viewCount:desc
```

| Tham số | Ý nghĩa |
| --- | --- |
| `keyword` | Tìm trong tiêu đề + mô tả |
| `subjectIds` | Nhiều môn học |
| `authorIds` | Nhiều người đăng |
| `fileTypes` | `pdf`, `docx`, `pptx` |
| `minRating` | Lọc theo điểm sao trung bình (phase 2) |
| `status` | Chỉ dùng cho admin: `PENDING`, `APPROVED`, `REJECTED` |
| `sort` | `createdAt:desc`, `viewCount:desc`, `ratingAvg:desc` |

## Bảng route

### Công khai (không cần token)

| Method | Route | Ghi chú |
| --- | --- | --- |
| POST | `/auth/register` | Tạo tài khoản **chưa xác thực** + gửi email, trả `{ message }` |
| POST | `/auth/verify-email` | Body `{ token }` → kích hoạt tài khoản |
| POST | `/auth/resend-verification` | Body `{ email }` → gửi lại link (1 lần / 5 phút) |
| POST | `/auth/forgot-password` | Body `{ email }` → gửi link đặt lại mật khẩu (hạn 1 giờ, dùng 1 lần, 1 lần / 5 phút); luôn trả cùng message để không lộ email có tồn tại |
| POST | `/auth/reset-password` | Body `{ token, newPassword }` → đổi mật khẩu + **thu hồi mọi phiên** (xoá `refreshTokenHash`) |
| POST | `/auth/refresh` | Cấp lại access token |

### Người dùng (bắt buộc đăng nhập — khách không xem được tài liệu)

| Method | Route | Ghi chú |
| --- | --- | --- |
| POST | `/auth/login` | Trả `accessToken`, `refreshToken`, `user`; **403 `EMAIL_NOT_VERIFIED`** nếu chưa xác thực email |
| PATCH | `/auth/password` | Đổi mật khẩu (cần mật khẩu cũ) |
| GET | `/users/me` | Hồ sơ của tôi |
| PATCH | `/users/me` | Cập nhật hồ sơ |
| PATCH | `/users/me/avatar` | Gán `avatarUrl` (lấy từ `/uploads`) |
| GET | `/users/:id` | Hồ sơ công khai + level |
| POST | `/uploads` | Upload file (multipart, field `file`) |
| GET | `/subjects` | Danh mục môn học |
| GET | `/dashboard/overview` | Số liệu tổng quan của tôi: đếm theo trạng thái, tổng lượt xem, lượt xem 7 ngày, 5 bài gần đây, top 5 bài nhiều view |
| GET | `/documents` | Danh sách đã duyệt + tìm kiếm/lọc |
| GET | `/documents/:id` | Chi tiết — **mỗi lần gọi sẽ ghi nhận 1 view** (dedupe theo ngày) |
| POST | `/documents` | Đăng tài liệu (vào trạng thái `PENDING`) |
| GET | `/documents/mine` | Tài liệu tôi đã chia sẻ (mọi trạng thái) |
| DELETE | `/documents/:id` | Tự xóa tài liệu của mình |

### Admin (`adminGuard` + `RolesGuard`, prefix `/admin`)

| Method | Route | Ghi chú |
| --- | --- | --- |
| GET | `/admin/dashboard/overview` | Thẻ số liệu + hoạt động gần đây |
| GET | `/admin/documents?status=PENDING` | Hàng chờ duyệt |
| PATCH | `/admin/documents/:id/approve` | Duyệt |
| PATCH | `/admin/documents/:id/reject` | Từ chối + `reason` |
| DELETE | `/admin/documents/:id` | Xóa tài liệu vi phạm |
| GET | `/admin/subjects` | Danh mục (kèm số tài liệu) |
| POST | `/admin/subjects` | Thêm môn học |
| DELETE | `/admin/subjects/:id` | Xóa môn học (chặn nếu còn tài liệu) |
| GET | `/admin/users` | Danh sách tài khoản + tìm kiếm |
| GET | `/admin/users/:id` | Chi tiết tài khoản + lịch sử cảnh báo |
| POST | `/admin/users/:id/warnings` | Gửi cảnh báo + lý do (≥ 10 ký tự); **đủ 3 cảnh báo → `BANNED`**, login bị chặn |

## Quy ước khác

- **Phân quyền:** mọi route dưới đây (trừ các route auth công khai + `/auth/refresh`) đều cần `Authorization: Bearer <accessToken>`. Khách chưa đăng nhập **không** xem được danh sách/chi tiết tài liệu.
- **Upload:** chỉ nhận `pdf`, `docx`, `pptx`, dung lượng ≤ 20MB (`MAX_UPLOAD_SIZE_MB`); sai định dạng/quá cỡ trả 400/413 kèm message tiếng Việt.
- **Rate limit theo IP** (chống spam): `POST /auth/login` 10 lượt / 5 phút, `POST /auth/forgot-password` 5 lượt / 15 phút,
  `POST /documents` 10 lượt / 60 phút. Vượt giới hạn → **429** kèm `message` tiếng Việt và header `Retry-After` (giây),
  `X-RateLimit-Limit`, `X-RateLimit-Remaining`. Chỉnh bằng `RATE_LIMIT_*` trong `.env`; sau reverse proxy đặt `TRUST_PROXY=true`
  để lấy IP thật từ `X-Forwarded-For`.
- ID dùng UUID (không lộ thứ tự bản ghi).
- Ngày giờ trả về ISO 8601 UTC.
- Không trả `passwordHash`, `deletedAt` ra ngoài — dùng mapper/`select` ở tầng service.
- Lỗi nghiệp vụ dùng `HttpException` của Nest (`BadRequestException`, `ForbiddenException`, ...), không tự build response.
