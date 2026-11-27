import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { AppNotification, PaginationMeta } from '../../../core/models';
import { NotificationStateService } from '../../../core/services/notification-state.service';
import { NotificationService } from '../../../core/services/notification.service';
import { getApiErrorMessages } from '../../../core/utils/api-error.util';

const PAGE_SIZE = 10;

/**
 * Danh sách thông báo đầy đủ (`/notifications`).
 *
 * Trước đây chỉ có dropdown 8 tin gần nhất trong header; trang này phân trang,
 * lọc "chỉ chưa đọc" và đọc từng tin. Bộ lọc + trang nằm trên URL (`?page=2&unreadOnly=true`)
 * nên gửi link hoặc bấm Back đều mở đúng trạng thái.
 */
@Component({
  selector: 'app-notification-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe],
  templateUrl: './notification-list.html',
  styleUrl: './notification-list.css',
})
export class NotificationList implements OnInit {
  private readonly notificationsApi = inject(NotificationService);
  private readonly notificationState = inject(NotificationStateService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly items = signal<AppNotification[]>([]);
  protected readonly meta = signal<PaginationMeta>({
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
    totalPages: 0,
  });
  /** Dùng chung với chuông trên header nên badge đổi ngay, không cần reload. */
  protected readonly unreadCount = this.notificationState.unreadCount;
  protected readonly unreadOnly = signal(false);
  protected readonly loading = signal(true);
  protected readonly errors = signal<string[]>([]);
  protected readonly markingAll = signal(false);
  protected readonly clearingAll = signal(false);

  /** Tối đa 5 số trang quanh trang hiện tại. */
  protected readonly pages = computed(() => {
    const { page, totalPages } = this.meta();
    const start = Math.max(1, Math.min(page - 2, totalPages - 4));
    const end = Math.min(totalPages, start + 4);
    return Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => start + index);
  });

  ngOnInit(): void {
    // URL là nguồn dữ liệu duy nhất cho trang + bộ lọc.
    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        this.unreadOnly.set(params.get('unreadOnly') === 'true');
        this.fetch(params);
      });
  }

  protected toggleUnreadOnly(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      replaceUrl: true,
      queryParams: { unreadOnly: this.unreadOnly() ? null : 'true', page: null },
    });
  }

  protected goToPage(page: number): void {
    const meta = this.meta();
    if (page < 1 || page > meta.totalPages || page === meta.page) {
      return;
    }

    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { page: page > 1 ? page : null, unreadOnly: this.unreadOnly() ? 'true' : null },
    });
  }

  /**
   * Nhấn thông báo chỉ đánh dấu đã đọc: danh sách này đã là trang xem tất cả thông báo
   * nên không mở trang chi tiết của tài liệu được nhắc tới.
   */
  protected open(item: AppNotification): void {
    if (!item.readAt) {
      this.notificationState
        .markRead(item.id)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: () => {
            this.items.update((list) =>
              list.map((notification) =>
                notification.id === item.id
                  ? { ...notification, readAt: new Date().toISOString() }
                  : notification,
              ),
            );
          },
          error: () => undefined,
        });
    }
  }

  protected markAllRead(): void {
    this.markingAll.set(true);

    this.notificationState
      .markAllRead()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          const now = new Date().toISOString();
          this.items.update((list) =>
            list.map((notification) => ({ ...notification, readAt: notification.readAt ?? now })),
          );
          this.markingAll.set(false);
          // Tải lại để badge/lọc "chưa đọc" khớp dữ liệu server.
          this.fetch(this.route.snapshot.queryParamMap);
        },
        error: (error: unknown) => {
          this.markingAll.set(false);
          this.errors.set(getApiErrorMessages(error));
        },
      });
  }

  /** Xoá toàn bộ thông báo khỏi danh sách của mình, rồi về trang 1. */
  protected clearAll(): void {
    if (this.meta().total === 0 || this.clearingAll() || this.markingAll()) {
      return;
    }

    if (!confirm('Xoá tất cả thông báo? Thao tác này không hoàn tác được.')) {
      return;
    }

    this.clearingAll.set(true);
    this.errors.set([]);

    this.notificationState
      .removeAll()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.clearingAll.set(false);

          if (this.meta().page > 1) {
            void this.router.navigate([], {
              relativeTo: this.route,
              replaceUrl: true,
              queryParams: { page: null },
              queryParamsHandling: 'merge',
            });
            return;
          }

          this.fetch(this.route.snapshot.queryParamMap);
        },
        error: (error: unknown) => {
          this.clearingAll.set(false);
          this.errors.set(getApiErrorMessages(error));
        },
      });
  }

  /** Xoá tin cá nhân hoặc ẩn tin chung; tải lại danh sách để số chưa đọc khớp server. */
  protected remove(item: AppNotification): void {
    const question = item.userId
      ? 'Xoá thông báo này? Thao tác không hoàn tác được.'
      : 'Ẩn thông báo này khỏi danh sách của bạn? Người khác vẫn thấy tin này.';

    if (!confirm(question)) {
      return;
    }

    this.errors.set([]);

    this.notificationsApi
      .remove(item.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.fetch(this.route.snapshot.queryParamMap),
        error: (error: unknown) => this.errors.set(getApiErrorMessages(error)),
      });
  }

  private fetch(params: ParamMap): void {
    const page = Math.max(1, Number(params.get('page') ?? '1') || 1);
    const unreadOnly = params.get('unreadOnly') === 'true';

    this.loading.set(true);
    this.errors.set([]);

    this.notificationsApi
      .list({ page, limit: PAGE_SIZE, unreadOnly })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          // Xoá tin cuối của trang cuối: lùi về trang còn dữ liệu.
          if (result.items.length === 0 && result.meta.page > 1) {
            void this.router.navigate([], {
              relativeTo: this.route,
              replaceUrl: true,
              queryParams: { page: result.meta.page - 1 },
              queryParamsHandling: 'merge',
            });
            return;
          }

          this.items.set(result.items);
          this.meta.set(result.meta);
          this.notificationState.sync(result);
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.items.set([]);
          this.meta.set({ page, limit: PAGE_SIZE, total: 0, totalPages: 0 });
          this.errors.set(getApiErrorMessages(error));
          this.loading.set(false);
        },
      });
  }
}
