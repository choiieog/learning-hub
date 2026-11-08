import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, tap } from 'rxjs';
import { API_BASE_URL } from '../constants/api.constants';
import { ApiResponse, PublicProfile, UpdateProfilePayload, User } from '../models';
import { StoredFile } from '../models/upload.model';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly baseUrl = `${API_BASE_URL}/users`;

  getMe(): Observable<User> {
    return this.http
      .get<ApiResponse<User>>(`${this.baseUrl}/me`)
      .pipe(map((res) => res.data));
  }

  updateProfile(payload: UpdateProfilePayload): Observable<User> {
    return this.http
      .patch<ApiResponse<User>>(`${this.baseUrl}/me`, payload)
      .pipe(
        map((res) => res.data),
        tap((user) => this.auth.setCurrentUser(user)),
      );
  }

  /** Luồng đổi avatar: upload ảnh lấy url → gán url vào hồ sơ. */
  updateAvatar(avatarUrl: string): Observable<User> {
    return this.http
      .patch<ApiResponse<User>>(`${this.baseUrl}/me/avatar`, { avatarUrl })
      .pipe(
        map((res) => res.data),
        tap((user) => this.auth.setCurrentUser(user)),
      );
  }

  /** Đổi avatar trong 1 bước: nhận file đã upload. */
  changeAvatar(file: StoredFile): Observable<User> {
    return this.updateAvatar(file.url);
  }

  getPublicProfile(userId: string): Observable<PublicProfile> {
    return this.http
      .get<ApiResponse<PublicProfile>>(`${this.baseUrl}/${userId}`)
      .pipe(map((res) => res.data));
  }
}
