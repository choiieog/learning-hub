import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { NotificationService } from './notification.service';

/** Số chưa đọc dùng chung cho chuông ở header và trang /notifications. */
@Injectable({ providedIn: 'root' })
export class NotificationStateService {
  private readonly api = inject(NotificationService);
  private readonly count = signal(0);

  readonly unreadCount = this.count.asReadonly();

  /** Server là nguồn sự thật: đồng bộ lại sau mỗi lần tải danh sách. */
  sync(page: { unreadCount: number }): void {
    this.count.set(page.unreadCount);
  }

  /** Giảm số chưa đọc ngay khi API xác nhận, không chờ refetch. */
  markRead(id: string): Observable<unknown> {
    return this.api
      .markRead(id)
      .pipe(tap(() => this.count.update((value) => Math.max(0, value - 1))));
  }

  markAllRead(): Observable<unknown> {
    return this.api.markAllRead().pipe(tap(() => this.count.set(0)));
  }

  removeAll(): Observable<unknown> {
    return this.api.removeAll().pipe(tap(() => this.count.set(0)));
  }
}
