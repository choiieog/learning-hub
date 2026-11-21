-- Ẩn thông báo chung theo từng người: row NotificationRead vẫn là trạng thái riêng,
-- thêm deletedAt để người dùng ẩn tin khỏi danh sách của mình mà không ảnh hưởng ai khác.
ALTER TABLE "NotificationRead" ADD COLUMN "deletedAt" TIMESTAMP(3);
