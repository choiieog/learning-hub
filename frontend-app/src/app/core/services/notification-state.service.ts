import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { NotificationPage } from '../models';
import { NotificationService } from './notification.service';

/**
 * Số thông báo chưa đọc dùng chung giữa chuông trên header và trang /notifications.
 *
 * Mỗi component từng giữ `unreadCount` riêng nên đọc tin ở trang danh sách không làm
 * badge trên header giảm cho tới khi reload. Server vẫn là nguồn sự thật: mọi response
 * list đồng bộ lại qua `syncFromPage`, còn thao tác đọc cập nhật ngay (lạc quan) để
 * header đổi số tức thì.
 */
@Injectable({ providedIn: 'root' })
export class NotificationStateService {
  private readonly api = inject(NotificationService);
  private readonly count = signal(0);

  readonly unreadCount = this.count.asReadonly();

  /** Đồng bộ số chưa đọc từ response của GET /notifications. */
  syncFromPage(page: NotificationPage): void {
    this.count.set(page.unreadCount);
  }

  /** Đánh dấu một tin đã đọc; số chưa đọc giảm ngay, không chờ refetch. */
  markRead(id: string, wasUnread: boolean): Observable<unknown> {
    return this.api.markRead(id).pipe(
      tap(() => {
        if (wasUnread) {
          this.count.update((value) => Math.max(0, value - 1));
        }
      }),
    );
  }

  /** Đọc tất cả: số chưa đọc về 0 ngay cho mọi component. */
  markAllRead(): Observable<unknown> {
    return this.api.markAllRead().pipe(tap(() => this.count.set(0)));
  }
}
