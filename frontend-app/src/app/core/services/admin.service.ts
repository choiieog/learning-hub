import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE_URL } from '../constants/api.constants';
import {
  AdminOverview,
  AdminUserDetail,
  AdminUserSummary,
  AdminUsersQuery,
  ApiResponse,
  AppNotification,
  BroadcastNotificationPayload,
  CreateSubjectPayload,
  DocumentDetail,
  DocumentSummary,
  ModerationQuery,
  Paginated,
  Subject,
  SystemSettings,
  User,
} from '../models';
import { toHttpParams } from '../utils/http-params.util';

/** Toàn bộ API của dashboard admin (prefix /api/admin). */
@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${API_BASE_URL}/admin`;

  overview(): Observable<AdminOverview> {
    return this.http
      .get<ApiResponse<AdminOverview>>(`${this.baseUrl}/dashboard/overview`)
      .pipe(map((res) => res.data));
  }

  // --- Phê duyệt bài viết ---

  documents(query: ModerationQuery = {}): Observable<Paginated<DocumentSummary>> {
    return this.http
      .get<ApiResponse<Paginated<DocumentSummary>>>(`${this.baseUrl}/documents`, {
        params: toHttpParams(query),
      })
      .pipe(map((res) => res.data));
  }

  approveDocument(id: string): Observable<DocumentDetail> {
    return this.http
      .patch<ApiResponse<DocumentDetail>>(`${this.baseUrl}/documents/${id}/approve`, {})
      .pipe(map((res) => res.data));
  }

  rejectDocument(id: string, reason: string): Observable<DocumentDetail> {
    return this.http
      .patch<ApiResponse<DocumentDetail>>(`${this.baseUrl}/documents/${id}/reject`, { reason })
      .pipe(map((res) => res.data));
  }

  removeDocument(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/documents/${id}`);
  }

  // --- Danh mục môn học ---

  subjects(): Observable<Subject[]> {
    return this.http
      .get<ApiResponse<Subject[]>>(`${this.baseUrl}/subjects`)
      .pipe(map((res) => res.data));
  }

  createSubject(payload: CreateSubjectPayload): Observable<Subject> {
    return this.http
      .post<ApiResponse<Subject>>(`${this.baseUrl}/subjects`, payload)
      .pipe(map((res) => res.data));
  }

  removeSubject(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/subjects/${id}`);
  }

  // --- Quản lý tài khoản ---

  users(query: AdminUsersQuery = {}): Observable<Paginated<AdminUserSummary>> {
    return this.http
      .get<ApiResponse<Paginated<AdminUserSummary>>>(`${this.baseUrl}/users`, {
        params: toHttpParams(query),
      })
      .pipe(map((res) => res.data));
  }

  /** Chi tiết tài khoản + lịch sử cảnh báo. */
  user(id: string): Observable<AdminUserDetail> {
    return this.http
      .get<ApiResponse<AdminUserDetail>>(`${this.baseUrl}/users/${id}`)
      .pipe(map((res) => res.data));
  }

  /** Gửi cảnh báo; backend trả lại chi tiết mới (warningCount, status, lịch sử). */
  warnUser(id: string, reason: string): Observable<AdminUserDetail> {
    return this.http
      .post<ApiResponse<AdminUserDetail>>(`${this.baseUrl}/users/${id}/warnings`, { reason })
      .pipe(map((res) => res.data));
  }

  // --- Thông báo hàng loạt ---

  /** Gửi một thông báo chung (userId = null) tới mọi sinh viên. */
  broadcastNotification(payload: BroadcastNotificationPayload): Observable<AppNotification> {
    return this.http
      .post<ApiResponse<AppNotification>>(`${this.baseUrl}/notifications/broadcast`, payload)
      .pipe(map((res) => res.data));
  }

  // --- Cấu hình hệ thống ---

  settings(): Observable<SystemSettings> {
    return this.http
      .get<ApiResponse<SystemSettings>>(`${this.baseUrl}/settings`)
      .pipe(map((res) => res.data));
  }

  /** `documentDailyLimit = 0` nghĩa là không giới hạn. */
  updateSettings(payload: { documentDailyLimit: number }): Observable<SystemSettings> {
    return this.http
      .patch<ApiResponse<SystemSettings>>(`${this.baseUrl}/settings`, payload)
      .pipe(map((res) => res.data));
  }
}
