import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE_URL } from '../constants/api.constants';
import { ApiResponse, LeaderboardResponse } from '../models';
import { toHttpParams } from '../utils/http-params.util';

@Injectable({ providedIn: 'root' })
export class GamificationService {
  private readonly http = inject(HttpClient);

  /** Bảng xếp hạng sinh viên theo EXP + vị trí hiện tại của người gọi. */
  leaderboard(page = 1, limit = 10): Observable<LeaderboardResponse> {
    const params = toHttpParams({ page, limit });

    return this.http
      .get<ApiResponse<LeaderboardResponse>>(`${API_BASE_URL}/leaderboard`, { params })
      .pipe(map((res) => res.data));
  }
}
