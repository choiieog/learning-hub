import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE_URL } from '../constants/api.constants';
import { ApiResponse, AvatarFramesResponse, User } from '../models';

/** Khung avatar mở khoá theo level — đọc danh sách và chọn khung đang dùng. */
@Injectable({ providedIn: 'root' })
export class AvatarFrameService {
  private readonly http = inject(HttpClient);

  list(): Observable<AvatarFramesResponse> {
    return this.http
      .get<ApiResponse<AvatarFramesResponse>>(`${API_BASE_URL}/avatar-frames`)
      .pipe(map((res) => res.data));
  }

  /** `null` để bỏ khung; backend trả hồ sơ mới để đồng bộ header. */
  select(frameId: string | null): Observable<User> {
    return this.http
      .patch<ApiResponse<User>>(`${API_BASE_URL}/users/me/avatar-frame`, { frameId })
      .pipe(map((res) => res.data));
  }
}
