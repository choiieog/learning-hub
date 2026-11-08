# src/infra/prisma

Chỗ đặt lớp truy cập DB (chưa tạo file vì chưa chốt ORM).

Khi chốt Prisma, thêm 2 file:

- `prisma.service.ts`

```ts
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() { await this.$connect(); }
  async onModuleDestroy() { await this.$disconnect(); }
}
```

- `prisma.module.ts` — `@Global()` module export `PrismaService` để mọi module inject được mà không phải import lại.

Sau đó: `npm i @prisma/client` + `npm i -D prisma`, `npx prisma migrate dev --name init`, `npx prisma generate`.
