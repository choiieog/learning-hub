# backend-app — Learning Hub API

NestJS 12 (Express 5) + Prisma 7 + PostgreSQL. Prefix toàn bộ route: `/api`, response bọc `{ success, data }`.

## Chạy local

```bash
npm ci
cp .env.example .env      # sửa DATABASE_URL trỏ tới PostgreSQL
npx prisma migrate deploy # hoặc: npm run db:migrate
npm run db:seed           # admin@learninghub.local / Admin@12345 + 5 môn học
npm run start:dev         # http://localhost:3000/api
```

Biến môi trường quan trọng: `DATABASE_URL`, `JWT_*`, `APP_URL`, `UPLOAD_DIR`, `MAX_UPLOAD_SIZE_MB`, `MAIL_DRIVER`, `STORAGE_DRIVER`,
`RATE_LIMIT_*` (giới hạn request theo IP), `TRUST_PROXY` (bật khi chạy sau reverse proxy).
`MAIL_DRIVER=console` (mặc định) in link xác thực email ra log; `MAIL_DRIVER=smtp` gửi thật qua nodemailer
(`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE` — xem `.env.example`).
`STORAGE_DRIVER=local` (mặc định) ghi file vào `UPLOAD_DIR` và phục vụ ở `/api/files/...`; các driver cloud chưa viết
nên giá trị khác sẽ báo lỗi ngay lúc khởi động (xem `src/infra/storage/README.md`).

## Kiểm tra

```bash
npm run build           # nest build
npx tsc --noEmit -p tsconfig.json
npx oxlint src/
npm test                # unit test (jest ESM, không cần database)
npm run test:e2e        # e2e thật: cần DATABASE_URL + `npx prisma migrate deploy` trước
```

## Trạng thái module

| Module | Trạng thái |
| --- | --- |
| `auth` | ✅ đăng ký, xác thực email, đăng nhập, refresh, đổi mật khẩu, quên/đặt lại mật khẩu |
| `documents` | ✅ danh sách, chi tiết + đếm view, đăng, `GET /mine`, sửa & gửi duyệt lại, xoá mềm |
| `uploads` | ✅ `POST /api/uploads` — validate rồi ghi qua `StorageService`, PDF/DOCX/PPTX, ≤ 20MB |
| `infra/storage` | 🟡 `StorageService` + driver `local`; driver cloud (Cloudinary/S3) chưa viết |
| `subjects` | ✅ đọc công khai + thêm/xoá mềm (chặn khi còn tài liệu) |
| `users` | ✅ hồ sơ (xem/sửa), avatar, hồ sơ công khai, danh sách cho admin, cảnh báo (tự khoá ở lần 3) |
| `admin` | ✅ duyệt/từ chối/xoá bài, overview, môn học, tài khoản + cảnh báo |
| `infra/mail` | ✅ `console` + `smtp` (nodemailer) gửi email xác thực |
| `notifications` | 🟡 thông báo duyệt/từ chối + đọc tin; chưa có broadcast — xem `src/modules/notifications/README.md` |
| `ratings`, `gamification`, `settings` | ⬜ phase 2, mới có README |

Chi tiết việc còn thiếu: [../docs/ROADMAP.md](../docs/ROADMAP.md).
