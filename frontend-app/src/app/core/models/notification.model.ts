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
  link?: string;
  readAt?: string;
  createdAt: string;
}

/** Kết quả GET /api/notifications — kèm số chưa đọc cho badge trên chuông. */
export interface NotificationPage {
  items: AppNotification[];
  meta: { page: number; limit: number; total: number; totalPages: number };
  unreadCount: number;
}
