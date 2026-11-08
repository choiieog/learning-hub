# Các quyết định cần chốt (kèm đề xuất mặc định)

Skeleton hiện tại **không cài thêm thư viện nào** để bạn đổi lựa chọn mà không phải gỡ code.
Mỗi mục dưới đây là một đề xuất mặc định — nói mục nào bạn muốn đổi, tôi sẽ triển khai theo lựa chọn đó.

## 1. Database + ORM

| Phương án | Ưu | Nhược |
| --- | --- | --- |
| **Prisma + PostgreSQL (đề xuất)** | Schema 1 file dễ đọc, migration rõ ràng, type an toàn | Cần cài Postgres (Docker 1 lệnh) |
| TypeORM + MySQL | Quen thuộc với nhiều đồ án VN, MySQL có sẵn trên XAMPP | Entity + migration rườm rà hơn, quan hệ nhiều-nhiều dài dòng |
| Prisma + MySQL | Vẫn giữ Prisma, chỉ đổi `provider` | MySQL yếu hơn Postgres ở full-text search |

Đã thiết kế sẵn `prisma/schema.prisma` theo hướng Prisma + PostgreSQL (đổi sang MySQL chỉ sửa 1 dòng `provider`).

**Đã chạy thật với Prisma 7.10.1** — lưu ý các điểm khác bản 6:

- generator là `provider = "prisma-client"` và **bắt buộc** `output` → client sinh vào `src/generated/prisma` (đã gitignore, sinh lại bằng `npm run db:generate`).
- `url` **không còn** trong block `datasource`; cấu hình nằm ở `prisma.config.ts` (schema path, migrations, seed).
- client phải khởi tạo bằng driver adapter: `new PrismaClient({ adapter: new PrismaPg({ connectionString }) })`.
- `prisma migrate dev` không tự generate/seed nữa; seed chạy bằng `tsx` (client sinh ra import `*.js`).
Chạy local: `docker run --name lh-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=learning_hub -p 5432:5432 -d postgres:16`

## 2. Xác thực  ✅ đã chốt

- JWT access token (15 phút) + refresh token (7 ngày), mật khẩu hash bằng `bcrypt` (`bcryptjs` — cùng thuật toán, không cần build native), 2 role `USER` / `ADMIN`.
- Refresh token ký bằng secret riêng và chỉ lưu **sha256** ở `User.refreshTokenHash`; đổi mật khẩu sẽ xóa hash này để thu hồi mọi phiên.
- **Bắt buộc xác thực email khi đăng ký — áp dụng cho mọi địa chỉ email** (không giới hạn email trường).

### Luồng xác thực email

```
POST /auth/register  → tạo User (emailVerifiedAt = null) → tạo EmailVerificationToken
                     → gửi email chứa link /auth/verify-email?token=... → trả { message }
POST /auth/verify-email { token } → so hash, kiểm hạn (24h) → set emailVerifiedAt → đánh dấu usedAt
POST /auth/login     → nếu emailVerifiedAt = null: 403 EMAIL_NOT_VERIFIED (không cấp token)
POST /auth/resend-verification { email } → gửi lại link, giới hạn 1 lần / 5 phút / tài khoản
```

- Chỉ lưu **hash** của token trong DB (`EmailVerificationToken.tokenHash`), token gốc chỉ có trong link.
- Đăng nhập bằng Google: để sau.
- Đổi mật khẩu vẫn yêu cầu mật khẩu cũ. **Quên mật khẩu đã làm:** `PasswordResetToken` (lưu sha256, hạn **1 giờ**, dùng một lần);
  `POST /auth/forgot-password` luôn trả cùng message (không lộ email tồn tại), giới hạn 1 lần / 5 phút và link mới nhất vô hiệu hoá link cũ;
  `POST /auth/reset-password` đổi mật khẩu rồi xoá `refreshTokenHash` → **thu hồi mọi phiên**. UI: `/auth/forgot-password`, `/auth/reset-password`.

### Gửi email — tách sau interface `MailService`

| Driver | Dùng khi | Ghi chú |
| --- | --- | --- |
| **`console` (mặc định khi dev)** | Chạy local, demo offline | In link xác thực ra log backend — không cần tài khoản dịch vụ nào |
| `smtp` ✅ đã làm | Demo/deploy thật | `nodemailer` + `SMTP_*` (Gmail app password, Brevo SMTP, Resend SMTP…) |
| Dịch vụ orchestration (Knock, Novu…) | Khi có nhiều kênh: email + push + in-app | Không cần cho 1 email xác thực; vẫn phải nối thêm nhà cung cấp gửi thật |

Chốt: `MAIL_DRIVER=console` khi dev, đổi sang `smtp` trước khi demo; code nghiệp vụ chỉ gọi `MailService.sendVerificationEmail()` nên đổi driver không sửa logic.

Đã hiện thực driver `smtp`: `SMTP_HOST/PORT/USER/PASS` + `SMTP_SECURE` (mặc định `true` khi cổng 465),
email có text + HTML và escape họ tên người dùng. Thiếu `SMTP_HOST` → backend báo lỗi ngay lúc khởi động;
gửi thất bại chỉ được log (không ném lỗi) vì tài khoản + token đã lưu và người dùng có thể "Gửi lại email xác thực".

## 3. Lưu file tài liệu (PDF/DOCX)

| Phương án | Ghi chú |
| --- | --- |
| **Local disk + Multer (đề xuất cho giai đoạn 1)** | Không cần tài khoản ngoài, chạy ngay; nhược điểm: mất file khi deploy lại |
| Cloudinary | Free tier, upload trực tiếp, có CDN; cần `CLOUDINARY_*` trong `.env` |
| Cloudflare R2 / AWS S3 | Chuẩn production, phù hợp file lớn; cần cấu hình bucket |

`uploads` module tách riêng và `src/infra/storage/` **đã có `StorageService`**: interface `StorageDriver`
(`upload`/`remove`), driver `local` mặc định ghi vào `UPLOAD_DIR` và trả `/api/files/...`; `UploadsService`
chỉ validate rồi gọi storage. Chưa có tài khoản Cloudinary/S3 nên driver cloud chưa viết — đặt
`STORAGE_DRIVER=cloudinary|s3` sẽ báo lỗi ngay lúc bootstrap (không âm thầm ghi ra đĩa).
Khi có tài khoản: thêm `drivers/<tên>.driver.ts` + nhánh trong `storage.module.ts`, không sửa nghiệp vụ.
Đề xuất: giai đoạn 1 dùng local, trước khi demo/deploy thì đổi sang Cloudinary.

## 4. UI kit cho frontend

- **Đề xuất:** Tailwind thuần + component tự viết trong `shared/components` (đã có Tailwind v4). Kiểm soát giao diện tốt, không phụ thuộc.
- Thay thế: PrimeNG (có sẵn table, form, dialog, multi-select — nhanh hơn cho dashboard admin) hoặc Angular Material.

## 5. Admin dùng chung app frontend hay app riêng?

- **Đề xuất:** chung 1 app, tách bằng route `/admin` + `adminGuard` + `AdminLayout` (đã dựng sẵn). Một lần build, một lần deploy, dùng lại model/service.
- Riêng app: cô lập tốt hơn nhưng phải nhân đôi cấu hình build/deploy.

## 6. "Tài liệu" là file đính kèm hay bài viết?

- **Đề xuất:** hybrid — mỗi tài liệu có `title`, `description`, `subjectId`, **1–3 file đính kèm** (`DocumentFile`), và `content` (markdown) tùy chọn cho bài viết hướng dẫn.
- Nếu bạn muốn thuần file (giống thư viện tài liệu) thì bỏ `content`.

## 7. Đếm lượt xem chống spam  ✅ đã chốt

- Bảng `DocumentView` khoá duy nhất `(documentId, viewerKey, dayKey)` — mỗi **user** chỉ tính 1 view / tài liệu / ngày; `Document.viewCount` là counter denormalized để sort nhanh.
- Khách không xem được chi tiết tài liệu (xem mục 11) nên `viewerKey` luôn là `userId`, không cần hash IP.
- Đơn giản hơn: tăng thẳng `viewCount` mỗi lần GET (dễ bị spam F5).

## 8. Duyệt / xóa bài

- **Đề xuất:** `status = PENDING | APPROVED | REJECTED` + `rejectReason`, xóa mềm `deletedAt` (admin vẫn xem/khôi phục được), chỉ tài liệu `APPROVED` mới hiện ở trang public.
- Sinh viên tự xóa: xóa mềm tài liệu của mình.

## 9. "Cảnh báo tài khoản" của admin

- **Đã chốt và đã làm:** bảng `UserWarning` (lý do + admin + thời điểm), `User.warningCount` đếm sẵn;
  đủ 3 cảnh báo thì tự động `User.status = BANNED` — `POST /api/auth/login` và `JwtAuthGuard` chặn tài khoản bị khoá.

## 10. Công thức level / EXP ✅ đã làm

- **Đề xuất:** `exp = viewCount * 1 + ratingCount * 5 + ratingAvg * 2`, mốc `expNeeded(level) = 100 * level^1.5`; lưu `User.exp`, `User.level`, lịch sử `ExpLog`. Bảng xếp hạng = query `ORDER BY level DESC, exp DESC` (không cần bảng riêng).
- **Đã hiện thực** (`modules/gamification`): EXP cộng theo sự kiện thay vì tính lại từ aggregate —
  `VIEW` +1 (1 người/tài liệu/ngày, tự xem không cộng), `RATING` +5 (chỉ đánh giá mới),
  `DOCUMENT_APPROVED` +20; mỗi lần cộng ghi `ExpLog`. Level suy ra từ tổng EXP với
  `levelStep(level) = round(100 * level^1.5)`. Bảng xếp hạng: `GET /api/leaderboard?limit=10`
  (chỉ `role = USER`, sắp theo `exp` desc) — không cần bảng riêng.

## 11. Năm điểm đã chốt (05/11/2026)

| # | Quyết định | Ảnh hưởng tới code |
| --- | --- | --- |
| 1 | **Khách chưa đăng nhập không được xem chi tiết tài liệu** | Toàn bộ route người dùng nằm sau `authGuard` (đã đúng); `GET /documents/:id` bắt buộc JWT nên không cần xử lý view ẩn danh |
| 2 | **Bắt buộc xác thực email, mọi email** | User có `emailVerifiedAt`, thêm `EmailVerificationToken`, 2 endpoint verify/resend, login chặn khi chưa xác thực (mục 2) |
| 3 | **Mỗi tài liệu thuộc đúng 1 môn** | `Document.subjectId` là khoá ngoại đơn (không bảng nối); bộ lọc vẫn cho chọn nhiều môn khi tìm kiếm |
| 4 | **File ≤ 20MB** | `MAX_UPLOAD_SIZE_MB=20`, whitelist `pdf`, `docx`, `pptx` kiểm ở `uploads` |
| 5 | **UI tiếng Việt, code tiếng Anh** | Xem mục 12 |

Còn tự do (không chặn tiến độ): có làm "quên mật khẩu" không, có giới hạn số bài đăng mỗi ngày không (đã có `SystemSetting` cho phase 2).

## 12. Quy ước ngôn ngữ

- **Code tiếng Anh:** tên class/biến/hàm/file, comment, commit message, tên route API, tên field DB.
- **UI tiếng Việt:** mọi chuỗi người dùng thấy (label, nút, thông báo lỗi hiển thị, `title` của route), nội dung `message` trong response trả về cho UI.
- Thông báo lỗi nội bộ (log, `NotImplementedException`) giữ tiếng Anh để dễ tra cứu.
- Chưa dùng thư viện i18n (`@ngx-translate`): chuỗi tiếng Việt đặt trực tiếp trong template; nếu sau này cần đa ngôn ngữ thì gom vào `core/constants/messages.ts` trước khi thêm i18n.
