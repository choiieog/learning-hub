# Learning Hub — Web chia sẻ tài liệu học tập

[![CI](https://github.com/choiieog/learning-hub/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/choiieog/learning-hub/actions/workflows/ci.yml)

Sinh viên đăng tài liệu theo môn học, tài liệu được admin duyệt trước khi hiển thị công khai.
Mỗi lượt xem được ghi nhận (tăng `viewCount`), làm nền tảng cho đánh giá sao và hệ thống level/EXP sau này.

## Công nghệ

| Thành phần | Công nghệ |
| --- | --- |
| Frontend (`frontend-app`) | Angular 21 (standalone + signals), Tailwind CSS v4, Vitest |
| Backend (`backend-app`) | NestJS 12 (Express 5), TypeScript, Jest |
| Database | PostgreSQL + Prisma 7 (migration đầu tiên đã áp dụng) — xem `docs/DATA-MODEL.md` |
| Lưu file | `StorageService` + driver `local` (`UPLOAD_DIR`, phục vụ `/api/files/...`) — xem `docs/DECISIONS.md` mục 3 |

## Hiện trạng

Đã chạy được đầu-cuối:

- Xác thực: đăng ký → xác thực email → đăng nhập/refresh → đổi mật khẩu → quên mật khẩu qua email (token 1 giờ, dùng một lần),
  kèm UI đăng nhập/đăng ký/xác thực email/quên mật khẩu/đặt lại mật khẩu.
- Tài liệu: danh sách + tìm kiếm/lọc/sắp xếp, chi tiết có đếm lượt xem, đăng tài liệu (1–3 file), **đã chia sẻ** (trạng thái, lý do từ chối, sửa & gửi duyệt lại, xoá mềm).
- Admin: duyệt/từ chối (kèm lý do)/xoá bài, xem trước PDF & DOCX; tác giả nhận thông báo trong chuông ở header.

`StorageService` đã có driver `local` và mail đã hỗ trợ `MAIL_DRIVER=smtp` (nodemailer). Còn lại: driver cloud
(Cloudinary/S3) chờ tài khoản dịch vụ. Chi tiết từng mục và vị trí code xem [docs/ROADMAP.md](docs/ROADMAP.md).

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

- **Backend** (service Postgres 16): `npm ci` → `prisma generate` → `prisma migrate deploy` trên DB trống → `tsc --noEmit` → `oxlint` → `nest build` → unit test → e2e.
- **Frontend**: `npm ci` → `ng build` (production).

Chạy lại cục bộ: `cd backend-app && npm run lint && npm test && npm run test:e2e` — e2e cần `DATABASE_URL` trỏ tới PostgreSQL đã chạy `prisma migrate deploy`.

## Tài liệu thiết kế

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — cây thư mục đầy đủ + quy ước đặt code
- [docs/DATA-MODEL.md](docs/DATA-MODEL.md) — mô hình dữ liệu (đã gồm cả phần phát triển sau)
- [docs/API-CONVENTIONS.md](docs/API-CONVENTIONS.md) — quy ước REST, phân trang, lọc nhiều lựa chọn
- [docs/ROADMAP.md](docs/ROADMAP.md) — hiện trạng (đã xong / còn thiếu) và phần phát triển sau
- [docs/DECISIONS.md](docs/DECISIONS.md) — các lựa chọn còn mở, kèm đề xuất mặc định
