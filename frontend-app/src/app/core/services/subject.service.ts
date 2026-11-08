import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE_URL } from '../constants/api.constants';
import { ApiResponse, Subject } from '../models';

@Injectable({ providedIn: 'root' })
export class SubjectService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${API_BASE_URL}/subjects`;

  /** Danh sách môn học — dùng cho bộ lọc nhiều lựa chọn ở trang tài liệu. */
  list(): Observable<Subject[]> {
    return this.http
      .get<ApiResponse<Subject[]>>(this.baseUrl)
      .pipe(map((res) => res.data));
  }

  findById(id: string): Observable<Subject> {
    return this.http
      .get<ApiResponse<Subject>>(`${this.baseUrl}/${id}`)
      .pipe(map((res) => res.data));
  }
}
