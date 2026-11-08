# Kiến trúc & cây thư mục

## Nguyên tắc

**Backend** — feature-based module, mỗi module tự chứa controller + service + DTO:

1. `controller` mỏng: chỉ nhận request, gọi service, không chứa logic.
2. `service` chứa toàn bộ nghiệp vụ + truy vấn dữ liệu.
3. DTO đặt cạnh module (`dto/`), đặt tên `VerbNounDto`.
4. Endpoint admin **luôn** nằm trong `modules/admin` và có prefix `/api/admin` + `RolesGuard`.
5. Thứ dùng chung (guard, filter, decorator, enum) nằm ở `src/common`, hạ tầng (DB, storage) ở `src/infra`.
6. Module mới (phase 2) mở thư mục riêng — không sửa cấu trúc cũ. `notifications` đã triển khai sớm (xem bảng trạng thái bên dưới).

**Frontend** — Angular standalone, chia theo tầng:

1. `core/` — thứ chạy 1 lần: service gọi API, model, guard, interceptor, hằng số.
2. `shared/` — component/directive/pipe dùng lại ở nhiều trang, không phụ thuộc feature (hiện mới có README, xem ghi chú).
3. `features/<feature>/pages/<page>/` — mỗi trang 1 component lazy-load.
4. `layouts/` — khung giao diện (user / admin / auth) chứa `<router-outlet />`.
5. State dùng **signals trong service** (`AuthService.currentUser`), chưa cần NgRx.

**Ngôn ngữ** — code (tên file, class, biến, comment, commit) viết **tiếng Anh**; chuỗi hiển thị cho người dùng viết **tiếng Việt** (xem [DECISIONS](DECISIONS.md) mục 12).

## Trạng thái triển khai

| Thành phần | Trạng thái |
| --- | --- |
| `infra/prisma` | ✅ `PrismaService` dùng `@prisma/adapter-pg` |
| `infra/mail` | ✅ driver `console` + `smtp` (nodemailer, `SMTP_*`) |
| `infra/storage` | ✅ `StorageService` + interface `StorageDriver`, driver `local` (cloud: thêm driver) |
| `modules/auth` | ✅ đăng ký, xác thực email, đăng nhập, refresh, đổi mật khẩu, quên/đặt lại mật khẩu |
| `modules/users` | ✅ hồ sơ (xem/sửa), avatar, hồ sơ công khai, danh sách cho admin, cảnh báo (tự khoá ở lần 3) |
| `modules/subjects` | ✅ đọc, thêm, xoá mềm (chặn khi còn tài liệu), `assertExists` |
| `modules/documents` | ✅ danh sách, chi tiết + view, đăng, `GET /mine`, sửa & gửi duyệt lại, xoá mềm |
| `modules/uploads` | ✅ `POST /api/uploads` (ghi qua `StorageService`, whitelist + giới hạn dung lượng) |
| `modules/admin` | ✅ duyệt/từ chối/xoá bài, overview, môn học, tài khoản + cảnh báo |
| `modules/dashboard` | ✅ `GET /api/dashboard/overview` — số liệu tổng quan của chính người dùng |
| `modules/notifications` | 🟡 thông báo duyệt/từ chối + đọc tin; chưa có broadcast |
| `modules/ratings`, `gamification`, `settings` | ⬜ chỉ có README (phase 2) |

Xem [ROADMAP](ROADMAP.md) để biết chi tiết việc còn thiếu.

## Cây thư mục

```
learning-hub/
├── backend-app/
│   ├── prisma/
│   │   └── schema.prisma            # thiết kế DB (User, Subject, Document, View, Notification, ...)
│   ├── src/
│   │   ├── main.ts                  # prefix /api, CORS, filter + interceptor, static /uploads
│   │   ├── app.module.ts
│   │   ├── app.controller.ts        # GET /api/health
│   │   ├── config/
│   │   │   └── configuration.ts     # đọc & gom biến môi trường
│   │   ├── common/
│   │   │   ├── decorators/          # @Roles(), @CurrentUser(), @RateLimit()
│   │   │   ├── dto/                 # PaginationQueryDto
│   │   │   ├── enums/               # Role, DocumentStatus
│   │   │   ├── filters/             # HttpExceptionFilter
│   │   │   ├── guards/              # JwtAuthGuard, RolesGuard, RateLimitGuard
│   │   │   ├── interceptors/        # ResponseInterceptor
│   │   │   └── interfaces/          # AuthenticatedUser
│   │   ├── infra/
│   │   │   ├── prisma/              # PrismaModule + PrismaService (driver adapter pg)
│   │   │   ├── mail/                # MailService — console + smtp (nodemailer)
│   │   │   └── storage/             # StorageService + driver local (interface StorageDriver)
│   │   └── modules/
│   │       ├── auth/                # đăng ký, xác thực email, đăng nhập, refresh, đổi mật khẩu, quên mật khẩu
│   │       ├── users/               # hồ sơ, avatar, hồ sơ công khai, quản lý tài khoản + cảnh báo ✅
│   │       ├── subjects/            # danh mục môn học: đọc công khai + CRUD admin ✅
│   │       ├── documents/           # danh sách, chi tiết + đếm view, đăng, sửa/gửi duyệt lại, xoá
│   │       ├── uploads/             # POST /api/uploads
│   │       ├── admin/               # duyệt bài, tổng quan, môn học, tài khoản + cảnh báo ✅
│   │       ├── dashboard/            # tổng quan sinh viên: số liệu + top tài liệu
│   │       ├── notifications/       # thông báo duyệt/từ chối + đọc tin (broadcast: phase 2)
│   │       ├── ratings/             # (phase 2) đánh giá sao
│   │       ├── gamification/        # (phase 2) level/exp/bảng xếp hạng
│   │       └── settings/            # (phase 2) cấu hình hệ thống
│   └── test/                        # e2e (supertest)
│
├── frontend-app/src/app/
│   ├── app.config.ts                # router + HttpClient + interceptor
│   ├── app.routes.ts                # toàn bộ route map
│   ├── core/
│   │   ├── constants/               # API_BASE_URL, storage keys
│   │   ├── guards/                  # authGuard, adminGuard, guestGuard
│   │   ├── interceptors/            # authInterceptor (Bearer), errorInterceptor
│   │   ├── models/                  # user / subject / document / notification
│   │   ├── services/                # auth, user, subject, document, upload, admin, notification
│   │   └── utils/                   # toHttpParams (lọc nhiều lựa chọn)
│   ├── shared/components/           # hiện chỉ có README — các trang đang viết template trực tiếp
│   ├── layouts/                     # auth-layout, user-layout (chuông thông báo), admin-layout
│   └── features/
│       ├── auth/pages/              # login, register, verify-email, forgot-password, reset-password ✅
│       ├── dashboard/pages/         # tổng quan sinh viên ✅ (thẻ số liệu, biểu đồ 7 ngày, top tài liệu)
│       ├── documents/pages/         # danh sách, chi tiết, đăng tài liệu, đã chia sẻ ✅
│       ├── profile/pages/           # hồ sơ (avatar), đổi mật khẩu ✅
│       └── admin/pages/             # duyệt bài, tổng quan, môn học, tài khoản ✅
│
└── docs/                            # kiến trúc, dữ liệu, API, roadmap, quyết định
```

## Luồng một request tiêu biểu

```
Angular page → core/services/document.service.ts
  → GET /api/documents?subjectIds=... (authInterceptor gắn Bearer token)
    → ResponseInterceptor bọc { success, data }
      → DocumentsController.findAll()
        → DocumentsService.findAll()  → Prisma → Subject/Document/User
```

Đăng tài liệu:

```
DocumentUpload page → UploadService.create(files) → POST /api/uploads → UploadsService.validate()
                    → StorageService.upload() (driver theo STORAGE_DRIVER, mặc định local)
                    → { url, name, size, mimeType }
                    → DocumentService.create({ title, description, subjectId, files })
                      → status = PENDING
                      → Admin → PATCH /api/admin/documents/:id/approve | /reject
                        → DocumentsService tạo Notification cho tác giả (đã triển khai)
                        → (phase 2) cộng EXP cho tác giả
```

Duyệt / từ chối và thông báo:

```
Admin duyệt  → DocumentsService.approve(id) → NotificationsService.notifyApproved()
Admin từ chối → DocumentsService.reject(id, reason) → NotificationsService.notifyRejected(..., reason)
Tác giả      → GET /api/notifications (kèm unreadCount) → chuông + badge trong UserLayout
             → PATCH /api/notifications/:id/read  |  PATCH /api/notifications/read-all
```

`markRead` chỉ áp dụng cho thông báo cá nhân (`userId` = người gọi) — thông báo broadcast (`userId = null`) chưa có trạng thái đọc riêng.
