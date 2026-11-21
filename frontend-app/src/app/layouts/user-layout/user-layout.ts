import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AppNotification } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { NotificationStateService } from '../../core/services/notification-state.service';
import { NotificationService } from '../../core/services/notification.service';
import { initials } from '../../core/utils/format.util';

/** Khung giao diện cho sinh viên: header (nav + chuông thông báo) + nội dung trang. */
@Component({
  selector: 'app-user-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, DatePipe],
  templateUrl: './user-layout.html',
  styleUrl: './user-layout.css',
})
export class UserLayout {
  protected readonly auth = inject(AuthService);
  private readonly notificationsApi = inject(NotificationService);
  private readonly notificationState = inject(NotificationStateService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly headerFrame = computed(
    () => this.auth.currentUser()?.avatarFrameUrl ?? null,
  );
  protected readonly headerInitials = computed(() =>
    initials(this.auth.currentUser()?.fullName ?? ''),
  );

  protected readonly panelOpen = signal(false);
  protected readonly notifications = signal<AppNotification[]>([]);
  /** Dùng chung với trang /notifications để badge đổi ngay khi đọc tin ở đó. */
  protected readonly unreadCount = this.notificationState.unreadCount;
  protected readonly loading = signal(false);

  constructor() {
    this.load();
  }

  protected togglePanel(): void {
    const next = !this.panelOpen();
    this.panelOpen.set(next);

    if (next) {
      this.load();
    }
  }

  /**
   * Mở thông báo: đánh dấu đã đọc rồi mở trang tất cả thông báo.
   * Không nhảy thẳng vào chi tiết tài liệu để người dùng còn thấy các tin khác.
   */
  protected openNotification(item: AppNotification): void {
    if (!item.readAt) {
      this.notificationState
        .markRead(item.id)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: () => {
            this.notifications.update((list) =>
              list.map((n) => (n.id === item.id ? { ...n, readAt: new Date().toISOString() } : n)),
            );
          },
          error: () => undefined,
        });
    }

    this.panelOpen.set(false);
    void this.router.navigate(['/notifications']);
  }

  protected markAllRead(): void {
    this.notificationState
      .markAllRead()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          const now = new Date().toISOString();
          this.notifications.update((list) => list.map((n) => ({ ...n, readAt: n.readAt ?? now })));
        },
        error: () => undefined,
      });
  }

  protected logout(): void {
    this.auth.logout();
    void this.router.navigate(['/auth/login']);
  }

  private load(): void {
    this.loading.set(true);

    this.notificationsApi
      .list({ limit: 8 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          this.notifications.set(page.items);
          this.notificationState.sync(page);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }
}
