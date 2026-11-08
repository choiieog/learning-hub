import { Routes } from '@angular/router';
import { adminGuard } from './core/guards/admin.guard';
import { authGuard } from './core/guards/auth.guard';
import { guestGuard } from './core/guards/guest.guard';

/**
 * Sơ đồ route:
 *   /                                → Landing      (công khai, khách xem được)
 *   /auth/login, /auth/register      → AuthLayout  (guestGuard)
 *   /auth/verify-email?token=...     → AuthLayout  (guestGuard, link trong email)
 *   /auth/forgot-password            → AuthLayout  (guestGuard, yêu cầu link đặt lại mật khẩu)
 *   /auth/reset-password?token=...   → AuthLayout  (guestGuard, link đặt lại mật khẩu trong email)
 *   /dashboard, /documents, ...      → UserLayout  (authGuard)
 *   /notifications                   → UserLayout  (authGuard, trang danh sách đầy đủ)
 *   /admin/...                       → AdminLayout (authGuard + adminGuard)
 */
export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: 'Learning Hub — Chia sẻ tài liệu học tập',
    loadComponent: () =>
      import('./features/marketing/pages/landing/landing').then((m) => m.Landing),
  },

  {
    path: 'auth',
    loadComponent: () => import('./layouts/auth-layout/auth-layout').then((m) => m.AuthLayout),
    children: [
      {
        path: 'login',
        title: 'Đăng nhập · Learning Hub',
        canActivate: [guestGuard],
        loadComponent: () => import('./features/auth/pages/login/login').then((m) => m.Login),
      },
      {
        path: 'register',
        title: 'Đăng ký · Learning Hub',
        canActivate: [guestGuard],
        loadComponent: () => import('./features/auth/pages/register/register').then((m) => m.Register),
      },
      {
        path: 'verify-email',
        title: 'Xác thực email · Learning Hub',
        canActivate: [guestGuard],
        loadComponent: () =>
          import('./features/auth/pages/verify-email/verify-email').then(
            (m) => m.VerifyEmail,
          ),
      },
      {
        path: 'forgot-password',
        title: 'Quên mật khẩu · Learning Hub',
        canActivate: [guestGuard],
        loadComponent: () =>
          import('./features/auth/pages/forgot-password/forgot-password').then(
            (m) => m.ForgotPassword,
          ),
      },
      {
        path: 'reset-password',
        title: 'Đặt lại mật khẩu · Learning Hub',
        canActivate: [guestGuard],
        loadComponent: () =>
          import('./features/auth/pages/reset-password/reset-password').then(
            (m) => m.ResetPassword,
          ),
      },
      { path: '', pathMatch: 'full', redirectTo: 'login' },
    ],
  },

  {
    path: '',
    loadComponent: () => import('./layouts/user-layout/user-layout').then((m) => m.UserLayout),
    canActivate: [authGuard],
    children: [
      {
        path: 'dashboard',
        title: 'Tổng quan · Learning Hub',
        loadComponent: () =>
          import('./features/dashboard/pages/dashboard/dashboard').then((m) => m.Dashboard),
      },
      {
        path: 'documents',
        title: 'Tài liệu · Learning Hub',
        loadComponent: () =>
          import('./features/documents/pages/document-list/document-list').then(
            (m) => m.DocumentList,
          ),
      },
      {
        path: 'documents/:id',
        title: 'Chi tiết tài liệu · Learning Hub',
        loadComponent: () =>
          import('./features/documents/pages/document-detail/document-detail').then(
            (m) => m.DocumentDetailPage,
          ),
      },
      {
        path: 'upload',
        title: 'Đăng tài liệu · Learning Hub',
        loadComponent: () =>
          import('./features/documents/pages/document-upload/document-upload').then(
            (m) => m.DocumentUpload,
          ),
      },
      {
        path: 'my-documents',
        title: 'Tài liệu đã chia sẻ · Learning Hub',
        loadComponent: () =>
          import('./features/documents/pages/my-documents/my-documents').then(
            (m) => m.MyDocuments,
          ),
      },
      {
        path: 'leaderboard',
        title: 'Bảng xếp hạng · Learning Hub',
        loadComponent: () =>
          import('./features/leaderboard/pages/leaderboard/leaderboard').then(
            (m) => m.Leaderboard,
          ),
      },
      {
        path: 'notifications',
        title: 'Thông báo · Learning Hub',
        loadComponent: () =>
          import('./features/notifications/pages/notification-list/notification-list').then(
            (m) => m.NotificationList,
          ),
      },
      {
        path: 'profile',
        title: 'Hồ sơ · Learning Hub',
        loadComponent: () =>
          import('./features/profile/pages/profile/profile').then((m) => m.Profile),
      },
      {
        path: 'profile/password',
        title: 'Đổi mật khẩu · Learning Hub',
        loadComponent: () =>
          import('./features/profile/pages/change-password/change-password').then(
            (m) => m.ChangePassword,
          ),
      },
    ],
  },

  {
    path: 'admin',
    loadComponent: () => import('./layouts/admin-layout/admin-layout').then((m) => m.AdminLayout),
    canActivate: [authGuard, adminGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        title: 'Quản trị · Learning Hub',
        loadComponent: () =>
          import('./features/admin/pages/admin-dashboard/admin-dashboard').then(
            (m) => m.AdminDashboard,
          ),
      },
      {
        path: 'subjects',
        title: 'Danh mục môn học · Learning Hub',
        loadComponent: () =>
          import('./features/admin/pages/admin-subjects/admin-subjects').then(
            (m) => m.AdminSubjects,
          ),
      },
      {
        path: 'documents',
        title: 'Phê duyệt bài viết · Learning Hub',
        loadComponent: () =>
          import('./features/admin/pages/admin-document-approval/admin-document-approval').then(
            (m) => m.AdminDocumentApproval,
          ),
      },
      {
        path: 'users',
        title: 'Quản lý tài khoản · Learning Hub',
        loadComponent: () =>
          import('./features/admin/pages/admin-users/admin-users').then((m) => m.AdminUsers),
      },
      {
        path: 'broadcast',
        title: 'Thông báo hàng loạt · Learning Hub',
        loadComponent: () =>
          import('./features/admin/pages/admin-broadcast/admin-broadcast').then(
            (m) => m.AdminBroadcast,
          ),
      },
      {
        path: 'settings',
        title: 'Cấu hình hệ thống · Learning Hub',
        loadComponent: () =>
          import('./features/admin/pages/admin-settings/admin-settings').then(
            (m) => m.AdminSettings,
          ),
      },
    ],
  },

  { path: '**', redirectTo: 'documents' },
];
