import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE_URL } from '../constants/api.constants';
import { ApiResponse, DashboardOverview } from '../models';

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly http = inject(HttpClient);

  /** Số liệu tổng quan của chính người đang đăng nhập. */
  overview(): Observable<DashboardOverview> {
    return this.http
      .get<ApiResponse<DashboardOverview>>(`${API_BASE_URL}/dashboard/overview`)
      .pipe(map((res) => res.data));
  }
}
