import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { filter, map } from 'rxjs';
import { AppNotification } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { NotificationStateService } from '../../core/services/notification-state.service';
import { NotificationService } from '../../core/services/notification.service';
import { initials } from '../../core/utils/format.util';

const RAIL_STORAGE_KEY = 'lh.user.rail.mini';

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Tổng quan',
  '/documents': 'Thư viện tài liệu',
  '/upload': 'Đăng tài liệu',
  '/my-documents': 'Đã chia sẻ',
  '/leaderboard': 'Bảng xếp hạng',
  '/notifications': 'Thông báo',
  '/profile/password': 'Đổi mật khẩu',
  '/profile': 'Hồ sơ cá nhân',
};

/** Khung giao diện cho sinh viên: rail thu gọn được + header (breadcrumb, chuông thông báo, tài khoản). */
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

  /** Rail mini 77px, nhớ lựa chọn giữa các lần tải. */
  protected readonly mini = signal(this.readMini());
  protected readonly railToggleLabel = computed(() =>
    this.mini() ? 'Mở rộng thanh điều hướng' : 'Thu gọn thanh điều hướng',
  );

  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );

  protected readonly pageTitle = computed(() => {
    const path = this.currentUrl().split('?')[0].split('#')[0];
    const match = Object.keys(PAGE_TITLES)
      .sort((a, b) => b.length - a.length)
      .find((route) => path === route || path.startsWith(`${route}/`));

    return match ? PAGE_TITLES[match] : 'Tổng quan';
  });

  protected readonly panelOpen = signal(false);
  protected readonly notifications = signal<AppNotification[]>([]);
  /** Dùng chung với trang /notifications để badge đổi ngay khi đọc tin ở đó. */
  protected readonly unreadCount = this.notificationState.unreadCount;
  protected readonly loading = signal(false);

  constructor() {
    this.load();
  }

  protected toggleRail(): void {
    const next = !this.mini();
    this.mini.set(next);

    try {
      localStorage.setItem(RAIL_STORAGE_KEY, next ? '1' : '0');
    } catch {
      // Chế độ riêng tư có thể chặn localStorage; thu gọn vẫn hoạt động trong phiên.
    }
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

  private readMini(): boolean {
    try {
      return localStorage.getItem(RAIL_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
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
