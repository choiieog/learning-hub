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
import { NotificationService } from '../../core/services/notification.service';
import { initials } from '../../core/utils/format.util';

/** Khung giao diện cho sinh viên: header (nav + chuông thông báo) + nội dung trang. */
@Component({
  selector: 'app-user-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, DatePipe],
  template: `
    <div class="min-h-screen bg-slate-50 text-slate-900">
      <header class="border-b border-slate-200 bg-white">
        <div class="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <a
            routerLink="/dashboard"
            class="shrink-0 whitespace-nowrap text-lg font-semibold text-indigo-600"
          >
            Learning Hub
          </a>

          <nav
            class="order-last flex w-full flex-wrap items-center gap-x-4 gap-y-2 whitespace-nowrap text-sm lg:order-none lg:w-auto lg:min-w-0 lg:flex-1 lg:flex-nowrap lg:overflow-x-auto"
          >
            <a routerLink="/dashboard" routerLinkActive="text-indigo-600 font-medium">Tổng quan</a>
            <a routerLink="/documents" routerLinkActive="text-indigo-600 font-medium">Tài liệu</a>
            <a routerLink="/upload" routerLinkActive="text-indigo-600 font-medium">Đăng tài liệu</a>
            <a routerLink="/my-documents" routerLinkActive="text-indigo-600 font-medium">
              Đã chia sẻ
            </a>
            <a routerLink="/leaderboard" routerLinkActive="text-indigo-600 font-medium">
              Xếp hạng
            </a>
            <a routerLink="/profile" routerLinkActive="text-indigo-600 font-medium">Hồ sơ</a>
          </nav>

          <div class="relative shrink-0">
            <button
              type="button"
              class="relative rounded-md border border-slate-300 p-1.5 text-slate-600 transition hover:bg-slate-100"
              [attr.aria-expanded]="panelOpen()"
              aria-haspopup="true"
              aria-label="Thông báo"
              (click)="togglePanel()"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4" aria-hidden="true">
                <path
                  d="M10 2.5A4.5 4.5 0 0 0 5.5 7v2.2c0 .5-.18.98-.5 1.35l-1.1 1.27A.75.75 0 0 0 4.47 13h11.06a.75.75 0 0 0 .57-1.24l-1.1-1.27a2.1 2.1 0 0 1-.5-1.35V7A4.5 4.5 0 0 0 10 2.5Z"
                />
                <path d="M8 14.75a2 2 0 0 0 4 0H8Z" />
              </svg>
              @if (unreadCount() > 0) {
                <span
                  class="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white"
                >
                  {{ unreadCount() > 9 ? '9+' : unreadCount() }}
                </span>
              }
            </button>

            @if (panelOpen()) {
              <div class="fixed inset-0 z-30" (click)="panelOpen.set(false)" aria-hidden="true"></div>
              <div
                class="fixed inset-x-4 top-16 z-40 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80"
              >
                <div class="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
                  <p class="text-sm font-semibold text-slate-900">Thông báo</p>
                  @if (unreadCount() > 0) {
                    <button
                      type="button"
                      class="text-xs font-semibold text-indigo-600 transition hover:text-indigo-700"
                      (click)="markAllRead()"
                    >
                      Đọc tất cả
                    </button>
                  }
                </div>

                <div class="max-h-80 overflow-y-auto">
                  @if (loading()) {
                    <p class="px-4 py-6 text-center text-sm text-slate-500">Đang tải…</p>
                  } @else if (notifications().length === 0) {
                    <p class="px-4 py-6 text-center text-sm text-slate-500">Chưa có thông báo nào.</p>
                  } @else {
                    <ul class="divide-y divide-slate-100">
                      @for (item of notifications(); track item.id) {
                        <li>
                          <button
                            type="button"
                            class="w-full px-4 py-3 text-left transition hover:bg-slate-50"
                            [class]="item.readAt ? '' : 'bg-indigo-50/40'"
                            (click)="openNotification(item)"
                          >
                            <div class="flex items-start justify-between gap-2">
                              <p class="text-sm font-semibold text-slate-900">{{ item.title }}</p>
                              @if (!item.readAt) {
                                <span
                                  class="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-indigo-500"
                                  aria-label="Chưa đọc"
                                ></span>
                              }
                            </div>
                            <p class="mt-0.5 line-clamp-3 text-xs leading-relaxed text-slate-600">
                              {{ item.message }}
                            </p>
                            <p class="mt-1 text-[11px] text-slate-400">
                              {{ item.createdAt | date: 'dd/MM/yyyy HH:mm' }}
                            </p>
                          </button>
                        </li>
                      }
                    </ul>
                  }
                </div>

                <a
                  routerLink="/notifications"
                  class="block border-t border-slate-100 px-4 py-2.5 text-center text-xs font-semibold text-indigo-600 transition hover:bg-slate-50"
                  (click)="panelOpen.set(false)"
                >
                  Xem tất cả thông báo
                </a>
              </div>
            }
          </div>

          <a
            routerLink="/profile"
            class="hidden min-w-0 shrink-0 items-center gap-2 sm:flex"
            title="Hồ sơ của bạn"
          >
            <span
              class="flex h-8 w-8 items-center justify-center rounded-full"
              [style.background]="headerFrame() ?? 'transparent'"
              [class.p-0.5]="headerFrame() !== null"
            >
              @if (auth.currentUser()?.avatarUrl; as avatarUrl) {
                <img [src]="avatarUrl" alt="" class="h-full w-full rounded-full object-cover" />
              } @else {
                <span
                  class="flex h-full w-full items-center justify-center rounded-full bg-indigo-50 text-[11px] font-semibold text-indigo-700"
                >
                  {{ headerInitials() }}
                </span>
              }
            </span>
            <span class="max-w-32 truncate text-sm text-slate-600">{{ auth.currentUser()?.fullName }}</span>
          </a>
          @if (auth.isAdmin()) {
            <a
              routerLink="/admin/dashboard"
              class="shrink-0 whitespace-nowrap text-sm text-amber-600"
            >
              Quản trị
            </a>
          }
          <button
            type="button"
            class="shrink-0 whitespace-nowrap rounded-md border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100"
            (click)="logout()"
          >
            Đăng xuất
          </button>
        </div>
      </header>

      <main class="mx-auto max-w-6xl px-4 py-6">
        <router-outlet />
      </main>
    </div>
  `,
})
export class UserLayout {
  protected readonly auth = inject(AuthService);
  private readonly notificationsApi = inject(NotificationService);
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
  protected readonly unreadCount = signal(0);
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

  /** Mở thông báo: đánh dấu đã đọc rồi đi tới tài liệu liên quan. */
  protected openNotification(item: AppNotification): void {
    if (!item.readAt) {
      this.notificationsApi
        .markRead(item.id)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: () => {
            this.notifications.update((list) =>
              list.map((n) => (n.id === item.id ? { ...n, readAt: new Date().toISOString() } : n)),
            );
            this.unreadCount.update((count) => Math.max(0, count - 1));
          },
          error: () => undefined,
        });
    }

    this.panelOpen.set(false);

    if (item.link) {
      void this.router.navigateByUrl(item.link);
    }
  }

  protected markAllRead(): void {
    this.notificationsApi
      .markAllRead()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          const now = new Date().toISOString();
          this.notifications.update((list) => list.map((n) => ({ ...n, readAt: n.readAt ?? now })));
          this.unreadCount.set(0);
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
          this.unreadCount.set(page.unreadCount);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }
}
