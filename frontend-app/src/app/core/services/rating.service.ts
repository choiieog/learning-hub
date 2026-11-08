import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE_URL } from '../constants/api.constants';
import { ApiResponse, RatingList, UpsertRatingPayload, UpsertRatingResult } from '../models';

/** Đánh giá sao của tài liệu — mỗi người một đánh giá, gửi lại là cập nhật. */
@Injectable({ providedIn: 'root' })
export class RatingService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${API_BASE_URL}/documents`;

  list(documentId: string, page = 1, limit = 10): Observable<RatingList> {
    const params = new HttpParams().set('page', page).set('limit', limit);

    return this.http
      .get<ApiResponse<RatingList>>(`${this.baseUrl}/${documentId}/ratings`, { params })
      .pipe(map((res) => res.data));
  }

  upsert(documentId: string, payload: UpsertRatingPayload): Observable<UpsertRatingResult> {
    return this.http
      .post<ApiResponse<UpsertRatingResult>>(`${this.baseUrl}/${documentId}/ratings`, payload)
      .pipe(map((res) => res.data));
  }
}
