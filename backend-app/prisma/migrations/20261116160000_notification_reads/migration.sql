-- Thông báo khi tài khoản bị cảnh báo.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ACCOUNT_WARNING';

-- Trạng thái đã đọc của thông báo chung, tách theo từng user.
CREATE TABLE "NotificationRead" (
    "userId" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotificationRead_pkey" PRIMARY KEY ("userId", "notificationId")
);

CREATE INDEX "NotificationRead_notificationId_idx" ON "NotificationRead"("notificationId");

ALTER TABLE "NotificationRead" ADD CONSTRAINT "NotificationRead_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationRead" ADD CONSTRAINT "NotificationRead_notificationId_fkey"
  FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;
