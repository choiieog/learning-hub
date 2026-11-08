export type UserRole = 'USER' | 'ADMIN';
export type UserStatus = 'ACTIVE' | 'WARNED' | 'BANNED';

export interface User {
  id: string;
  email: string;
  fullName: string;
  studentCode?: string;
  bio?: string;
  avatarUrl?: string;
  /** id khung avatar đang dùng (null/undefined = không dùng khung) */
  avatarFrameId?: string | null;
  /** gradient/ảnh của khung avatar đang dùng — backend trả sẵn để vẽ vòng */
  avatarFrameUrl?: string | null;
  role: UserRole;
  status: UserStatus;
  warningCount: number;
  /** null/undefined while the account has not confirmed its email yet. */
  emailVerifiedAt?: string | null;
  /** (phase 2) dùng cho bảng xếp hạng */
  level: number;
  exp: number;
  createdAt: string;
}

/** Hồ sơ công khai — không có email/status */
export interface PublicProfile {
  id: string;
  fullName: string;
  avatarUrl?: string;
  avatarFrameUrl?: string;
  level: number;
  documentCount: number;
  totalViews: number;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  email: string;
  password: string;
  fullName: string;
  studentCode?: string;
}

/** Neutral message returned by register / verify / resend endpoints. */
export interface MessageResult {
  message: string;
}

export interface EmailVerificationPayload {
  token: string;
}

export interface ResendVerificationPayload {
  email: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export interface ForgotPasswordPayload {
  email: string;
}

export interface ResetPasswordPayload {
  /** Raw token from the reset link in the email. */
  token: string;
  newPassword: string;
}

export interface UpdateProfilePayload {
  fullName?: string;
  studentCode?: string;
  bio?: string;
}

export interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
}

export interface UserWarning {
  id: string;
  reason: string;
  adminName: string;
  createdAt: string;
}
