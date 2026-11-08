# src/infra/storage

Lớp trừu tượng lưu file: nghiệp vụ (`UploadsService`) chỉ gọi `StorageService`, còn nơi lưu thật
do `STORAGE_DRIVER` quyết định.

> **Trạng thái: đã triển khai driver `local`** (mặc định). Driver cloud (`cloudinary`, `s3`) chưa làm —
> đặt `STORAGE_DRIVER=cloudinary|s3` sẽ **fail fast** lúc bootstrap thay vì âm thầm ghi ra đĩa,
> vì file trên đĩa sẽ mất khi deploy lại.

## File

```
storage/
├── storage.module.ts        # @Global; chọn driver theo STORAGE_DRIVER
├── storage.service.ts       # cổng duy nhất: upload() / remove()
├── storage.types.ts         # StorageDriver, StoredFile, StorageUploadInput, token STORAGE_DRIVER
└── drivers/
    └── local.driver.ts      # ghi vào UPLOAD_DIR, trả url /api/files/<folder>/<uuid>.<ext>
```

## Interface

```ts
export interface StorageDriver {
  readonly name: string;
  upload(input: StorageUploadInput, folder: UploadFolder): Promise<StoredFile>;
  remove(publicId: string): Promise<void>;
}

export interface StoredFile {
  url: string; // dùng ngay trong <a href> / <img src>, đi qua proxy /api
  publicId: string; // khoá để xoá: "<folder>/<file>"
  name: string; // tên gốc người dùng tải lên
  size: number;
  mimeType: string;
}
```

`UploadsService` kiểm tra thư mục, dung lượng, đuôi ↔ MIME trước khi gọi driver — driver chỉ ghi byte.

## Driver `local`

- Ghi `<UPLOAD_DIR>/<folder>/<uuid>.<ext>`; `main.ts` phục vụ thư mục này qua `useStaticAssets` với prefix `/api/files`.
- Tên file do server sinh nên không phụ thuộc tên người dùng (không ghi đè, không path traversal).
- `remove(publicId)` chặn `../` (publicId có thể đến từ client khi xoá) và idempotent (`force: true`).
- Mất file khi deploy lại / ổ đĩa ephemeral — đây là lý do cần driver cloud trước khi lên production.

## Thêm driver cloud (khi có tài khoản)

1. Cài SDK (`cloudinary` hoặc `@aws-sdk/client-s3`).
2. Tạo `drivers/<tên>.driver.ts` implements `StorageDriver` (upload trả `url` công khai + `publicId`).
3. Thêm nhánh trong `storage.module.ts` và biến môi trường vào `.env.example`.
4. Đặt `STORAGE_DRIVER=<tên>` — không cần sửa `UploadsService` hay bất kỳ module nào khác.
5. URL tài liệu cũ vẫn nằm trên storage cũ → cần migrate dữ liệu hoặc giữ 2 driver đọc song song.
