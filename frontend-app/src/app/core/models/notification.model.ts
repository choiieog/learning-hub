/** Thông báo trong app */
export type NotificationType =
  | 'DOCUMENT_APPROVED'
  | 'DOCUMENT_REJECTED'
  | 'DOCUMENT_DELETED'
  | 'SYSTEM';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  /** `null` = thông báo chung: người dùng chỉ ẩn được với riêng mình, admin xoá hẳn cho mọi người. */
  userId: string | null;
  readAt?: string;
  createdAt: string;
}

/** Body của POST /api/admin/notifications/broadcast */
export interface BroadcastNotificationPayload {
  title: string;
  message: string;
}

/** Kết quả GET /api/notifications — kèm số chưa đọc cho badge trên chuông. */
export interface NotificationPage {
  items: AppNotification[];
  meta: { page: number; limit: number; total: number; totalPages: number };
  unreadCount: number;
}
