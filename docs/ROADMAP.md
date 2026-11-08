# Roadmap

Cập nhật lần cuối: **08/11/2026** — tài liệu này phản ánh **code đang chạy**, không phải kế hoạch ban đầu.
Ký hiệu: ✅ đã xong · 🟡 một phần · ⬜ chưa làm

## Tổng quan

| Hạng mục | Trạng thái |
| --- | --- |
| Xác thực: đăng ký → xác thực email → đăng nhập → refresh → đổi mật khẩu → quên mật khẩu | ✅ backend + UI |
| Đăng tài liệu (upload 1–3 file, metadata, chọn môn) | ✅ |
| Danh sách tài liệu: tìm kiếm + lọc nhiều lựa chọn + sắp xếp | ✅ |
| Chi tiết tài liệu + đếm lượt xem | ✅ |
| Tài liệu đã chia sẻ: trạng thái, lý do từ chối, sửa & gửi duyệt lại, xoá mềm | ✅ |
| Admin duyệt bài: xem trước PDF/DOCX, duyệt, từ chối, xoá | ✅ |
| Thông báo duyệt / từ chối cho tác giả (chuông + API) | ✅ (làm sớm từ giai đoạn 2) |
| Trang tổng quan sinh viên: thẻ số liệu, lượt xem 7 ngày, tài liệu gần đây, top tài liệu | ✅ |
| Hồ sơ: sửa thông tin, mã sinh viên, giới thiệu, avatar, đổi mật khẩu | ✅ |
| Admin: tổng quan, danh mục môn học, tài khoản & cảnh báo | ✅ |
| `StorageService` (local → cloud) | 🟡 driver `local` ✅, driver cloud ⬜ |
| Mail driver `smtp` | ✅ nodemailer, cấu hình `SMTP_*` |
| Giai đoạn 2: rating, settings, avatar frame, EXP/level, broadcast | ⬜ |

## Giai đoạn 1 — đã xong

### Người dùng

- ✅ **Backend auth** (`modules/auth`): đăng ký → xác thực email → đăng nhập JWT → refresh → đổi mật khẩu.
  Gồm `POST /auth/register`, `/verify-email`, `/resend-verification`, `/login`, `/refresh`, `PATCH /auth/password`.
- ✅ **UI auth** (`features/auth/pages`): đăng nhập, đăng ký, xác thực email (`/auth/login`, `/auth/register`, `/auth/verify-email`).
- ✅ **Đăng tài liệu** (`/upload`): 1–3 file PDF/DOCX/PPTX, mỗi file ≤ 20MB, tiêu đề 5–200 ký tự, chọn đúng 1 môn; bài mới ở trạng thái `PENDING`.
- ✅ **Danh sách tài liệu** (`/documents`): tìm kiếm theo từ khoá + lọc nhiều lựa chọn (môn học, người đăng, loại file) + sắp xếp + phân trang.
- ✅ **Chi tiết tài liệu** (`/documents/:id`): chỉ người đã đăng nhập; tăng `viewCount` với dedupe `DocumentView` (1 view/người/tài liệu/ngày theo giờ Việt Nam).
- ✅ **Tài liệu đã chia sẻ** (`/my-documents`): tab theo trạng thái, hiển thị lý do từ chối, xoá mềm có xác nhận, **sửa & gửi duyệt lại** (`PATCH /api/documents/:id`, có thể thay file) — mục này vượt so với kế hoạch ban đầu.
- ✅ **Trang tổng quan** (`/dashboard`): thẻ số liệu (tổng / đã duyệt / chờ duyệt / bị từ chối), tổng lượt xem + biểu đồ 7 ngày,
  5 tài liệu gần đây kèm trạng thái & lý do từ chối, 5 tài liệu nhiều lượt xem nhất. Dữ liệu từ `GET /api/dashboard/overview`
  (`modules/dashboard`) — một request gom đủ số liệu của chính người đăng nhập.
- ✅ **Hồ sơ** (`/profile`): xem/sửa họ tên, mã sinh viên (unique), giới thiệu; đổi avatar qua upload → `PATCH /users/me/avatar`;
  hồ sơ công khai `GET /users/:id` trả level + số tài liệu đã duyệt + tổng lượt xem.
- ✅ **Đổi mật khẩu** (`/profile/password`): kiểm mật khẩu hiện tại, xác nhận khớp, đổi xong thu hồi phiên và yêu cầu đăng nhập lại.
- ✅ **Quên mật khẩu** (`/auth/forgot-password`, `/auth/reset-password?token=...`): gửi email qua `MailService`
  (console/smtp), token lưu dạng sha256, **hạn 1 giờ, dùng một lần**, link mới nhất vô hiệu hoá link cũ; đặt lại xong
  thu hồi mọi phiên. Backend trả cùng một message dù email có tồn tại hay không (chống dò tài khoản) và giới hạn 1 lần / 5 phút.

### Admin

- ✅ **Phê duyệt bài viết** (`/admin/documents`): danh sách `PENDING`, xem trước PDF/DOCX, duyệt (`PATCH /api/admin/documents/:id/approve`), từ chối kèm lý do (`.../reject`), xoá (`DELETE /api/admin/documents/:id`).
- ✅ **Tổng quan admin** (`/admin/dashboard`): `GET /api/admin/dashboard/overview` — đếm user (tổng, mới 7 ngày, bị cảnh báo, bị khoá),
  đếm tài liệu theo trạng thái, tổng lượt xem + 7 ngày, top 5 tài liệu nhiều view, 10 hoạt động gần đây (bài đăng + cảnh báo).
- ✅ **Danh mục môn học** (`/admin/subjects`): bảng môn kèm số tài liệu; thêm môn (mã chuẩn hoá chữ hoa, trùng mã → 409);
  xoá mềm và **chặn xoá khi môn còn tài liệu** (backend 409 + UI khoá nút).
- ✅ **Quản lý tài khoản** (`/admin/users`): tìm theo email/tên/mã SV, lọc vai trò + trạng thái + “chỉ tài khoản bị cảnh báo”, phân trang;
  chi tiết kèm 10 cảnh báo gần nhất; gửi cảnh báo kèm lý do (tối thiểu 10 ký tự) — **đủ 3 cảnh báo thì tự khoá** `BANNED` và login bị chặn.
- ✅ **Thông báo cho tác giả** (`modules/notifications`): tự tạo thông báo khi duyệt / từ chối (kèm lý do), API `GET /api/notifications`, `PATCH /api/notifications/:id/read`, `PATCH /api/notifications/read-all`; chuông + badge chưa đọc trong `UserLayout`.

### Hạ tầng

- ✅ Prisma 7 + PostgreSQL, migration đầu tiên đã áp dụng; `PrismaService` dùng driver adapter `@prisma/adapter-pg`.
- ✅ Auth JWT + `JwtAuthGuard` + `RolesGuard` + hash bcrypt; refresh token lưu sha256.
- ✅ `MailService` với 2 driver: `console` (in link xác thực ra log — mặc định khi dev) và `smtp`
  (nodemailer, `SMTP_*`); thiếu `SMTP_HOST` thì báo lỗi ngay lúc bootstrap.
- ✅ Rate limit theo IP cho route nhạy cảm (`common/guards/rate-limit.guard.ts` + `@RateLimit()`):
  đăng nhập, quên mật khẩu, đăng tài liệu; trả 429 kèm `Retry-After`, cấu hình qua `RATE_LIMIT_*`.
- ✅ Seed: 1 admin đã xác thực + 5 môn học + tài khoản sinh viên demo.
- ✅ `UploadsService` kiểm tra file (whitelist định dạng + giới hạn dung lượng) rồi giao việc lưu cho
  `StorageService` (`src/infra/storage`, global) — driver `local` ghi vào `UPLOAD_DIR`, trả `/api/files/...`.
  Đổi `STORAGE_DRIVER` sang cloud chỉ cần thêm driver, không sửa nghiệp vụ.

## Giai đoạn 1 — còn thiếu

### Ưu tiên 1 — cần có trước khi demo

1. ✅ **`StorageService`** — `src/infra/storage` có interface `StorageDriver` + driver `local` (mặc định),
   `UploadsService` không còn tự ghi đĩa. Driver `cloudinary`/`s3` để sau khi có tài khoản: thêm
   `drivers/<tên>.driver.ts` + nhánh trong `storage.module.ts` (đặt `STORAGE_DRIVER` lạ sẽ fail fast).
2. ✅ **Mail driver `smtp`** — `MailService` gửi thật qua nodemailer (`SMTP_HOST/PORT/USER/PASS`, `SMTP_SECURE`),
   nội dung email có cả text + HTML; lỗi gửi được log và **không chặn đăng ký** (người dùng dùng "Gửi lại email xác thực").

### Ưu tiên 2 — nên làm trước khi bảo vệ

3. ⬜ **Trang danh sách thông báo đầy đủ** — hiện chỉ có dropdown 8 tin gần nhất trong header, chưa có route `/notifications` có phân trang.
4. ⬜ **Thông báo khi admin xoá bài** — mới chỉ báo khi duyệt / từ chối.
5. 🟡 **Kiểm thử tự động** — đã có unit test `auth.service.password-reset.spec.ts` (10 case) và
   **e2e thật với Postgres** `test/password-reset.e2e-spec.ts` (4 case: message trung tính, chỉ lưu hash,
   đổi mật khẩu + thu hồi phiên + token dùng lại, token hết hạn), kèm health e2e. Hạ tầng jest
   đã chuyển sang **ESM** (NestJS 12 phát hành ESM-only). Còn thiếu test cho documents và notifications.
6. 🟡 **Kiểm tra file tải lên** — **đã có rate limit theo IP** cho đăng nhập (10/5 phút), quên mật khẩu (5/15 phút),
   đăng tài liệu (10/60 phút); còn thiếu kiểm magic bytes/MIME thực (hiện mới dựa vào đuôi file + MIME client gửi).

## Giai đoạn 2 — "phát triển sau"

| Tính năng | Nơi triển khai | Trạng thái |
| --- | --- | --- |
| Thông báo duyệt/từ chối + thông báo chung | `modules/notifications`, `Notification.userId = null` là broadcast | 🟡 đã có duyệt/từ chối + đọc tin; **thiếu** broadcast, thông báo xoá bài, trang danh sách |
| Đánh giá sao bài viết | `modules/ratings` + `Document.ratingAvg/ratingCount` | ⬜ chỉ có README |
| Cấu hình hệ thống (bật/tắt, giới hạn bài đăng) | `modules/settings` + `SystemSetting` | ⬜ chỉ có README |
| Nâng cấp hồ sơ (khung avatar) | `AvatarFrame` + `User.avatarFrameId` | ⬜ chỉ có README |
| Level / EXP / bảng xếp hạng | `modules/gamification` + `ExpLog` | ⬜ chỉ có README |
| Gửi thông báo hàng loạt | `POST /api/admin/notifications/broadcast` | ⬜ |

Ghi chú: thứ tự thực tế đã lệch so với kế hoạch ban đầu — thông báo được làm **trước** rating vì admin duyệt bài cần phản hồi cho tác giả.

## Việc chưa nằm trong kế hoạch nhưng nên bổ sung

- **Đăng nhập bằng Google / OAuth** — chưa có; auth hiện dùng email + mật khẩu.
- **CI + đóng gói triển khai** — chưa có `.github/workflows`, Dockerfile hay docker-compose; hướng dẫn chạy vẫn thủ công.
- **Nhật ký kiểm toán (audit log)** cho hành động admin (duyệt, từ chối, xoá, cảnh báo).
- **Xuất dữ liệu / thống kê cho admin** (CSV tài liệu, user) nếu cần báo cáo.
- **Trang 404 riêng** — hiện `**` redirect về `/documents`.

## Thứ tự làm gợi ý (từ hiện trạng)

1. Admin: môn học + quản lý tài khoản/cảnh báo (backend đang 501, UI đã có route).
2. Hồ sơ + đổi mật khẩu + avatar (hoàn tất nhóm "người dùng").
3. Dashboard sinh viên và dashboard admin (cần API thống kê, làm cùng nhau).
4. ~~`StorageService` + `MAIL_DRIVER=smtp`~~ — **đã xong**; trước khi demo chỉ cần điền `SMTP_*` thật vào `.env`.
5. Test tự động cho auth/documents/notifications + CI.
6. Giai đoạn 2: broadcast + thông báo xoá bài → rating → EXP/level → settings → avatar frame.

## Nhật ký cập nhật

- **08/11/2026 (tiếp 5)** — thêm **e2e test cho luồng quên mật khẩu** (`test/password-reset.e2e-spec.ts`)
  chạy với Postgres thật, mock `MailService` để lấy token gửi trong mail; kiểm message trung tính,
  DB chỉ lưu hash, đổi mật khẩu + **refresh token cũ 401** + mật khẩu cũ 401 + mật khẩu mới 201,
  token dùng lại 400, token hết hạn 400. Thêm `test/create-test-app.ts` (cấu hình app giống `main.ts`),
  `test/e2e-env.ts` (nạp `.env`), chuyển `jest-e2e.json` sang ESM; sửa `app.e2e-spec.ts` cũ (đang fail)
  thành test `GET /api/health`. `npm run test:e2e` → 5/5 pass.

- **08/11/2026 (tiếp 4)** — thêm **test tự động cho luồng quên mật khẩu** (`src/modules/auth/auth.service.password-reset.spec.ts`,
  10 case) và sửa hạ tầng test: NestJS 12 là ESM-only nên `jest.config.ts` dùng ts-jest ESM preset +
  `tsconfig.spec.json`, script `npm test` chạy với `NODE_OPTIONS=--experimental-vm-modules`, các spec import
  `@jest/globals`; thêm `rootDir` vào `tsconfig.json` cho TypeScript 6. `npm test` 10/10 pass.

- **08/11/2026 (tiếp 3)** — thêm **rate limit theo IP** cho 3 route chống spam: `POST /auth/login` (10/5 phút),
  `POST /auth/forgot-password` (5/15 phút), `POST /documents` (10/60 phút) bằng `RateLimitGuard` + decorator `@RateLimit()`
  (in-memory, không thêm thư viện); trả **429** kèm message tiếng Việt, `Retry-After` và `X-RateLimit-*`;
  cấu hình `RATE_LIMIT_*` + `TRUST_PROXY`. Đã test thật: 10 lần đăng bài → 429 ở lần 11, 5 lần quên mật khẩu → 429 ở lần 6,
  10 lần login → 429 ở lần 11, `GET /api/health` không bị ảnh hưởng.

- **08/11/2026 (tiếp 2)** — thêm **quên mật khẩu**: model `PasswordResetToken` (hash + hạn 1 giờ + `usedAt`),
  `POST /api/auth/forgot-password` (email qua `MailService`, chống dò tài khoản, 1 lần / 5 phút, link mới vô hiệu hoá link cũ)
  và `POST /api/auth/reset-password` (dùng một lần, đổi mật khẩu xong xoá `refreshTokenHash` → thu hồi mọi phiên).
  UI: `/auth/forgot-password`, `/auth/reset-password` + link "Quên mật khẩu?" ở trang đăng nhập. Đã test với SMTP sink:
  nhận mail → đặt lại → token cũ 400, refresh token cũ 401, mật khẩu cũ 401, mật khẩu mới 201.

- **08/11/2026 (tiếp)** — hoàn thành **mail driver `smtp`**: `MailService` dùng `nodemailer` với `SMTP_HOST/PORT/USER/PASS`
  (+ `SMTP_SECURE`, tự bật cho cổng 465), email xác thực có text + HTML, escape họ tên người dùng;
  thiếu `SMTP_HOST` → lỗi ngay lúc bootstrap, lỗi gửi chỉ log để không chặn đăng ký. Đã test với SMTP sink thật:
  đăng ký → nhận email → xác thực → đăng nhập được. **Ưu tiên 1 đã xong toàn bộ.**

- **08/11/2026** — hoàn thành **`StorageService`**: `src/infra/storage` có interface `StorageDriver`
  (`upload`/`remove`), `StorageService` global và driver `local` (`UPLOAD_DIR` → `/api/files/...`, chặn path traversal);
  `UploadsService` chỉ còn validate rồi gọi storage nên đổi `STORAGE_DRIVER` không phải sửa nghiệp vụ.
  Chưa có tài khoản Cloudinary/S3 nên driver cloud chưa viết — đặt `STORAGE_DRIVER` lạ sẽ báo lỗi ngay lúc bootstrap
  thay vì âm thầm ghi ra đĩa. Ưu tiên 1 chỉ còn mail driver `smtp`.

- **07/11/2026 (tiếp 3)** — hoàn thành **nhóm admin còn thiếu**: `AdminService.getOverview`, CRUD danh mục môn học
  (chặn xoá khi còn tài liệu), quản lý tài khoản + cảnh báo (tự khoá ở lần thứ 3), dựng lại 3 trang
  `/admin/dashboard`, `/admin/subjects`, `/admin/users`; bổ sung validator cho 3 DTO admin/subject
  (`whitelist: true` đang làm rỗng body). Ưu tiên 1 chỉ còn `StorageService` và mail `smtp`.
- **07/11/2026 (tiếp 2)** — hoàn thành **Hồ sơ + đổi mật khẩu**: hiện thực `UsersService.findById/getPublicProfile/updateProfile/updateAvatar`
  (bổ sung validator cho `UpdateProfileDto`/`UpdateAvatarDto` vì `whitelist: true` đang xoá sạch body), chặn mã sinh viên trùng (409),
  chỉ nhận avatar do server lưu, dựng lại `/profile` và `/profile/password`; `findAllForAdmin/warn` vẫn 501 (thuộc mục admin).
- **07/11/2026 (tiếp)** — hoàn thành **Trang tổng quan sinh viên**: thêm `modules/dashboard` + `GET /api/dashboard/overview`
  (đếm theo trạng thái, tổng lượt xem, lượt xem 7 ngày theo `DocumentView.dayKey`, 5 bài gần đây, top 5 bài nhiều view)
  và dựng lại `/dashboard`; chuyển mục này từ "còn thiếu" sang "đã xong".
- **07/11/2026** — đối chiếu lại toàn bộ với code: đánh dấu xong các mục auth UI, upload, danh sách, chi tiết, đã chia sẻ,
  duyệt bài; thêm mục thông báo (đã làm một phần của giai đoạn 2); ghi rõ 7 mục còn là stub/placeholder kèm vị trí code;
  bổ sung nhóm "chưa nằm trong kế hoạch" (quên mật khẩu, test, CI, audit log, 404).
