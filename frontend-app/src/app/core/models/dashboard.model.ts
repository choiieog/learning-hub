import { DocumentStatus } from './document.model';
import { Subject } from './subject.model';

/** Thẻ tài liệu trên trang tổng quan (đủ cho cả "của tôi" và "nhiều lượt xem"). */
export interface DashboardDocumentCard {
  id: string;
  title: string;
  status: DocumentStatus;
  viewCount: number;
  createdAt: string;
  publishedAt?: string | null;
  /** chỉ có ở tài liệu của tôi */
  rejectReason?: string | null;
  subject: Pick<Subject, 'id' | 'code' | 'name'>;
  files: { name: string; mimeType: string; size: number }[];
  /** chỉ có ở top tài liệu toàn hệ thống */
  author?: { id: string; fullName: string; avatarUrl?: string | null };
}

export interface DashboardStats {
  totalDocuments: number;
  approved: number;
  pending: number;
  rejected: number;
  totalViews: number;
  viewsLast7Days: number;
}

export interface DashboardOverview {
  stats: DashboardStats;
  /** Lượt xem tài liệu của tôi theo ngày (cũ → mới, tối đa 7 điểm). */
  viewTrend: { day: string; count: number }[];
  recentDocuments: DashboardDocumentCard[];
  topDocuments: DashboardDocumentCard[];
}
