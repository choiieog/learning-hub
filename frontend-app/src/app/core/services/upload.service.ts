import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE_URL } from '../constants/api.constants';
import { ApiResponse, StoredFile, UploadFolder } from '../models';

@Injectable({ providedIn: 'root' })
export class UploadService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${API_BASE_URL}/uploads`;

  /** Upload 1 file (multipart, field `file`) → trả url để lưu vào tài liệu/avatar. */
  upload(file: File, folder: UploadFolder = 'documents'): Observable<StoredFile> {
    const form = new FormData();
    form.append('file', file);
    form.append('folder', folder);

    return this.http
      .post<ApiResponse<StoredFile>>(this.baseUrl, form)
      .pipe(map((res) => res.data));
  }
}
