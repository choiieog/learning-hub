import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE_URL } from '../constants/api.constants';
import { ApiResponse, NotificationPage } from '../models';
import { toHttpParams } from '../utils/http-params.util';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${API_BASE_URL}/notifications`;

  /** Thông báo của tôi + thông báo chung, mới nhất trước. */
  list(query: { page?: number; limit?: number; unreadOnly?: boolean } = {}): Observable<NotificationPage> {
    return this.http
      .get<ApiResponse<NotificationPage>>(this.baseUrl, { params: toHttpParams(query) })
      .pipe(map((res) => res.data));
  }

  markRead(id: string): Observable<{ id: string; readAt: string }> {
    return this.http
      .patch<ApiResponse<{ id: string; readAt: string }>>(`${this.baseUrl}/${id}/read`, {})
      .pipe(map((res) => res.data));
  }

  markAllRead(): Observable<{ updated: number }> {
    return this.http
      .patch<ApiResponse<{ updated: number }>>(`${this.baseUrl}/read-all`, {})
      .pipe(map((res) => res.data));
  }
}
