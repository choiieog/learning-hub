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
import { AppNotification, PaginationMeta } from '../../../../core/models';
import { NotificationService } from '../../../../core/services/notification.service';
import { getApiErrorMessages } from '../../../../core/utils/api-error.util';

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
  template: `
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Thông báo</h1>
        <p class="mt-1 text-sm text-slate-500">
          Kết quả duyệt bài, cảnh báo và tin chung từ quản trị viên.
        </p>
      </div>

      <div class="flex flex-wrap items-center gap-3">
        <label class="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            class="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            [checked]="unreadOnly()"
            (change)="toggleUnreadOnly($event)"
          />
          Chỉ chưa đọc
        </label>
        <button
          type="button"
          class="btn-secondary w-auto"
          [disabled]="unreadCount() === 0 || markingAll()"
          (click)="markAllRead()"
        >
          {{ markingAll() ? 'Đang xử lý...' : 'Đọc tất cả' }}
        </button>
      </div>
    </div>

    <p class="mt-2 text-sm text-slate-500">
      {{ unreadCount() }} thông báo chưa đọc · {{ meta().total }} thông báo
    </p>

    @if (errors().length > 0) {
      <div class="alert alert-error mt-6" role="alert">
        @for (error of errors(); track error) {
          <p>{{ error }}</p>
        }
      </div>
    }

    @if (loading()) {
      <div class="mt-6 space-y-3" aria-busy="true">
        @for (placeholder of [1, 2, 3, 4]; track placeholder) {
          <div class="animate-pulse rounded-xl border border-slate-200 bg-white p-4">
            <div class="h-4 w-1/3 rounded bg-slate-200"></div>
            <div class="mt-2 h-3 w-2/3 rounded bg-slate-100"></div>
          </div>
        }
      </div>
    } @else if (items().length === 0) {
      <div class="mt-6 rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
        <p class="text-sm font-medium text-slate-700">
          {{ unreadOnly() ? 'Không còn thông báo chưa đọc' : 'Chưa có thông báo nào' }}
        </p>
        <p class="mt-1 text-sm text-slate-500">
          Khi quản trị viên duyệt, từ chối hoặc xoá bài của bạn, thông báo sẽ xuất hiện ở đây.
        </p>
      </div>
    } @else {
      <ul class="mt-6 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
        @for (item of items(); track item.id) {
          <li>
            <button
              type="button"
              class="flex w-full items-start gap-3 px-4 py-4 text-left transition hover:bg-slate-50"
              [class]="item.readAt ? '' : 'bg-indigo-50/40'"
              (click)="open(item)"
            >
              <span
                class="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                [class]="item.readAt ? 'bg-transparent' : 'bg-indigo-500'"
                [attr.aria-label]="item.readAt ? null : 'Chưa đọc'"
              ></span>

              <div class="min-w-0 flex-1">
                <p class="text-sm font-semibold text-slate-900">{{ item.title }}</p>
                <p class="mt-1 text-sm leading-relaxed text-slate-600">{{ item.message }}</p>
                <p class="mt-2 text-xs text-slate-400">
                  {{ item.createdAt | date: 'dd/MM/yyyy HH:mm' }}
                  @if (item.link) {
                    <span class="text-indigo-600"> · Xem chi tiết</span>
                  }
                </p>
              </div>
            </button>
          </li>
        }
      </ul>
    }

    @if (meta().totalPages > 1) {
      <nav class="mt-8 flex items-center justify-center gap-1" aria-label="Phân trang thông báo">
        <button
          type="button"
          class="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
          [disabled]="meta().page <= 1"
          aria-label="Trang trước"
          (click)="goToPage(meta().page - 1)"
        >
          ‹
        </button>

        @for (page of pages(); track page) {
          <button
            type="button"
            [class]="
              page === meta().page
                ? 'rounded-lg border border-indigo-600 bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white'
                : 'rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-50'
            "
            [attr.aria-current]="page === meta().page ? 'page' : null"
            (click)="goToPage(page)"
          >
            {{ page }}
          </button>
        }

        <button
          type="button"
          class="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
          [disabled]="meta().page >= meta().totalPages"
          aria-label="Trang sau"
          (click)="goToPage(meta().page + 1)"
        >
          ›
        </button>
      </nav>
    }
  `,
})
export class NotificationList implements OnInit {
  private readonly notificationsApi = inject(NotificationService);
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
  protected readonly unreadCount = signal(0);
  protected readonly unreadOnly = signal(false);
  protected readonly loading = signal(true);
  protected readonly errors = signal<string[]>([]);
  protected readonly markingAll = signal(false);

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

  protected toggleUnreadOnly(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;

    void this.router.navigate([], {
      relativeTo: this.route,
      replaceUrl: true,
      queryParams: { unreadOnly: checked ? 'true' : null, page: null },
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

  /** Mở thông báo: đánh dấu đã đọc rồi đi tới tài liệu liên quan (nếu có). */
  protected open(item: AppNotification): void {
    if (!item.readAt) {
      this.notificationsApi
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
            this.unreadCount.update((count) => Math.max(0, count - 1));
          },
          error: () => undefined,
        });
    }

    if (item.link) {
      void this.router.navigateByUrl(item.link);
    }
  }

  protected markAllRead(): void {
    this.markingAll.set(true);

    this.notificationsApi
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
          this.items.set(result.items);
          this.meta.set(result.meta);
          this.unreadCount.set(result.unreadCount);
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
