import { UserRole, UserStatus } from './user.model';

/** Số liệu trang tổng quan admin — GET /api/admin/dashboard/overview */
export interface AdminOverview {
  users: { total: number; newIn7Days: number; warned: number; banned: number };
  documents: { total: number; pending: number; approved: number; rejected: number };
  views: { total: number; in7Days: number };
  topDocuments: {
    id: string;
    title: string;
    viewCount: number;
    subject: { code: string; name: string };
    author: { fullName: string };
  }[];
  recentActivity: {
    id: string;
    type: 'DOCUMENT' | 'WARNING';
    message: string;
    createdAt: string;
  }[];
}

/** Thẻ tài khoản trong bảng quản lý của admin */
export interface AdminUserSummary {
  id: string;
  email: string;
  fullName: string;
  studentCode?: string | null;
  avatarUrl?: string | null;
  role: UserRole;
  status: UserStatus;
  warningCount: number;
  level: number;
  emailVerifiedAt?: string | null;
  createdAt: string;
  documentCount: number;
}

export interface AdminUserWarning {
  id: string;
  reason: string;
  createdAt: string;
  admin: { id: string; fullName: string };
}

/** Chi tiết tài khoản + lịch sử cảnh báo — GET /api/admin/users/:id */
export interface AdminUserDetail extends AdminUserSummary {
  bio?: string | null;
  exp: number;
  warnings: AdminUserWarning[];
}

export interface AdminUsersQuery {
  keyword?: string;
  role?: UserRole;
  status?: UserStatus;
  warnedOnly?: boolean;
  page?: number;
  limit?: number;
}
