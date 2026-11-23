# src/infra/prisma

Lớp truy cập DB: Prisma 7 + PostgreSQL, nối qua driver adapter `@prisma/adapter-pg`
(Prisma 7 bắt buộc dùng driver adapter, không còn đọc `DATABASE_URL` từ `schema.prisma`).

## File

- `prisma.service.ts` — `PrismaService extends PrismaClient`, tạo `new PrismaPg({ connectionString })`
  từ `DATABASE_URL` và nối/ngắt theo vòng đời Nest (`onModuleInit` / `onModuleDestroy`).
- `prisma.module.ts` — `@Global()`, export `PrismaService` để mọi module inject được mà không phải import lại.

## Client được sinh ra

- Generator `prisma-client` với `output = "../src/generated/prisma"` (Prisma 7 bắt buộc khai báo `output`),
  nên client nằm trong source tree chứ không ở `node_modules`.
- Sinh lại bằng `npm run db:generate`; `postinstall` cũng chạy `prisma generate`.
- **Không sửa tay** các file trong `src/generated/prisma`.

## Kết nối & migration

- `DATABASE_URL` được đọc trong `prisma.config.ts` cho Prisma CLI, và trong `PrismaService` cho app.
- `npm run db:migrate` (`prisma migrate dev`) khi phát triển, `npx prisma migrate deploy` khi CI/deploy.
- Script chạy ngoài Nest (`prisma/seed.ts`, `scripts/prune-data.ts`) tự tạo `new PrismaService()`
  rồi `$connect()` / `$disconnect()`, không đi qua DI của Nest.
