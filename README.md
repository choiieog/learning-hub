# Learning Hub — Web chia sẻ tài liệu học tập

[![CI](https://github.com/choiieog/learning-hub/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/choiieog/learning-hub/actions/workflows/ci.yml)

Sinh viên đăng tài liệu theo môn học, tài liệu được admin duyệt trước khi hiển thị công khai.
Mỗi lượt xem được ghi nhận (tăng `viewCount`), làm nền tảng cho đánh giá sao và hệ thống level/EXP sau này.

## Công nghệ

| Thành phần | Công nghệ |
| --- | --- |
| Frontend (`frontend-app`) | Angular 21 (standalone + signals), Tailwind CSS v4, Vitest |
| Backend (`backend-app`) | NestJS 12 (Express 5), TypeScript, Jest |
| Database | PostgreSQL + Prisma 7 (migration đầu tiên đã áp dụng) |
| Lưu file | `StorageService` + driver `local` (`UPLOAD_DIR`, phục vụ `/api/files/...`) |

## Quy ước giao diện (UI convention)

- **Chỉ làm giao diện desktop/laptop**, kiểm tra ở độ rộng 1280–1920px (mặc định 1440px).
- **Không thêm breakpoint, layout hay tối ưu riêng cho mobile/tablet** trừ khi được yêu cầu rõ ràng.
- Phần responsive mobile hiện có được giữ nguyên, không xoá và không tiếp tục chỉnh sửa.
- Quy ước này áp dụng cho mọi trang UI (landing, auth, tài liệu, admin, hồ sơ…) cho đến khi có yêu cầu thay đổi.

## Hiện trạng

Đã chạy được đầu-cuối:

- Xác thực: đăng ký → xác thực email → đăng nhập/refresh → đổi mật khẩu → quên mật khẩu qua email (token 1 giờ, dùng một lần),
  kèm UI đăng nhập/đăng ký/xác thực email/quên mật khẩu/đặt lại mật khẩu.
- Tài liệu: danh sách + tìm kiếm/lọc/sắp xếp, chi tiết có đếm lượt xem, **xem trước PDF/DOCX ngay trên web**, đăng tài liệu (1–3 file), **đã chia sẻ** (trạng thái duyệt, xoá hẳn kèm đánh giá).
- Admin: duyệt/từ chối (kèm lý do)/xoá bài, xem trước file của bài chờ duyệt ngay trên web, gửi & thu hồi thông báo chung; tác giả nhận thông báo trong chuông và trang `/notifications`, xoá được thông báo cá nhân.

`StorageService` đã có driver `local` và mail đã hỗ trợ `MAIL_DRIVER=smtp` (nodemailer). Còn lại: driver cloud
(Cloudinary/S3) chờ tài khoản dịch vụ.

## Chạy dự án

```bash
# Backend — http://localhost:3000/api
cd backend-app
npm ci
cp .env.example .env        # sửa DATABASE_URL trỏ tới PostgreSQL của bạn
npm run db:migrate          # tạo & áp migration (lần đầu)
npm run db:seed             # admin@learninghub.local / Admin@12345 + 5 môn học
npm run start:dev

# Frontend — http://localhost:4200
cd frontend-app
npm ci
npm start
```

## Chạy bằng Docker Compose

Dựng cả Postgres + backend + frontend bằng một lệnh (không cần cài Node/Postgres trên máy):

```bash
docker compose up --build      # lần đầu build image, các lần sau khởi động nhanh
docker compose run --rm migrate npm run db:seed   # (tuỳ chọn) admin + 5 môn học
docker compose down            # dừng; thêm -v để xoá luôn DB và file đã tải
```

- Frontend: <http://localhost:8080> · API: <http://localhost:3000/api>
- Postgres chỉ nằm trong mạng nội bộ của compose (không chiếm cổng 5432 trên máy); cần psql thì `docker compose exec db psql -U postgres learning_hub`.
- Service `migrate` chạy `prisma migrate deploy` xong mới cho backend khởi động.
- Dữ liệu ở volume `db-data`, file tải lên ở volume `uploads`; `nginx` phục vụ SPA và chuyển `/api/*` sang backend.
- Đổi `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` bằng biến môi trường hoặc file `.env` cạnh `docker-compose.yml` khi không dùng giá trị mặc định.

Mặc định `MAIL_DRIVER=console` nên link xác thực email được **in ra log backend** thay vì gửi thật.
Đổi sang `smtp` (kèm `SMTP_*`) trước khi demo; tài khoản admin tạo bởi seed đã ở trạng thái đã xác thực.

## Kiểm thử & CI

Workflow [`.github/workflows/ci.yml`](.github/workflows/ci.yml) chạy khi push vào `main` và với mọi pull request:

- **Backend** (service Postgres 16): `npm ci` → `prisma generate` → `tsc --noEmit` → `oxlint` → `nest build` → unit test → e2e. E2E tự tạo/reset database test và chạy migrations.
- **Frontend**: `npm ci` → `ng build` (production).

Chạy lại cục bộ: `cd backend-app && npm run lint && npm test && npm run test:e2e` — `test:e2e` tự tạo/reset database `<tên database trong DATABASE_URL>_test` (hoặc `E2E_DATABASE_URL`) và chạy migrations trước suite; cần quyền tạo database.

Nên bật branch protection cho `main` (bắt buộc pull request + hai check trên phải xanh trước khi merge):
GitHub → Settings → Branches → Add branch protection rule, chọn `main` và `Require status checks to pass`
với hai check `Backend · typecheck / lint / build / unit / e2e` và `Frontend · build`.
