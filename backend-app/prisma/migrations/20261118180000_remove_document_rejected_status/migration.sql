-- Từ chối tài liệu giờ là xoá hẳn bài (DocumentsService.reject), nên không còn
-- trạng thái REJECTED được tạo ra nữa. Dọn các bài REJECTED còn sót:
-- DocumentFile / DocumentView / Rating cascade theo FK của Document; UploadedFile
-- dùng FK SetNull nên bản ghi file được giữ lại (object trên storage phải dọn riêng).
DELETE FROM "Document" WHERE "status" = 'REJECTED';

-- Lý do từ chối không còn được lưu hay hiển thị ở đâu.
ALTER TABLE "Document" DROP COLUMN "rejectReason";

-- Postgres không xoá được một giá trị enum: tạo lại type rồi đổi cột sang type mới.
ALTER TYPE "DocumentStatus" RENAME TO "DocumentStatus_old";
CREATE TYPE "DocumentStatus" AS ENUM ('PENDING', 'APPROVED');
ALTER TABLE "Document" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Document" ALTER COLUMN "status" TYPE "DocumentStatus" USING ("status"::text::"DocumentStatus");
ALTER TABLE "Document" ALTER COLUMN "status" SET DEFAULT 'PENDING';
DROP TYPE "DocumentStatus_old";
