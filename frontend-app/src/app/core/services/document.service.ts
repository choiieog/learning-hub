import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE_URL } from '../constants/api.constants';
import {
  ApiResponse,
  CreateDocumentPayload,
  DocumentDetail,
  DocumentListQuery,
  DocumentSummary,
  MyDocumentSummary,
  MyDocumentsQuery,
  Paginated,
  ResubmitDocumentPayload,
} from '../models';
import { toHttpParams } from '../utils/http-params.util';

@Injectable({ providedIn: 'root' })
export class DocumentService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${API_BASE_URL}/documents`;

  /** Danh sách tài liệu đã duyệt + tìm kiếm/lọc nhiều lựa chọn. */
  list(query: DocumentListQuery = {}): Observable<Paginated<DocumentSummary>> {
    return this.http
      .get<ApiResponse<Paginated<DocumentSummary>>>(this.baseUrl, {
        params: toHttpParams(query),
      })
      .pipe(map((res) => res.data));
  }

  /** Chi tiết tài liệu — mỗi lần gọi backend ghi nhận 1 lượt xem. */
  findById(id: string): Observable<DocumentDetail> {
    return this.http
      .get<ApiResponse<DocumentDetail>>(`${this.baseUrl}/${id}`)
      .pipe(map((res) => res.data));
  }

  /** Tài liệu tôi đã chia sẻ (mọi trạng thái duyệt). */
  findMine(query: MyDocumentsQuery = {}): Observable<Paginated<MyDocumentSummary>> {
    return this.http
      .get<ApiResponse<Paginated<MyDocumentSummary>>>(`${this.baseUrl}/mine`, {
        params: toHttpParams(query),
      })
      .pipe(map((res) => res.data));
  }

  create(payload: CreateDocumentPayload): Observable<DocumentDetail> {
    return this.http
      .post<ApiResponse<DocumentDetail>>(this.baseUrl, payload)
      .pipe(map((res) => res.data));
  }

  /** Sửa tài liệu bị từ chối rồi gửi duyệt lại (backend đưa về PENDING). */
  resubmit(id: string, payload: ResubmitDocumentPayload): Observable<DocumentDetail> {
    return this.http
      .patch<ApiResponse<DocumentDetail>>(`${this.baseUrl}/${id}`, payload)
      .pipe(map((res) => res.data));
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
}
