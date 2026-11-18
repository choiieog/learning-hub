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
import { ActivatedRoute, ParamMap, Router, RouterLink } from '@angular/router';
import { DocumentStatus, DocumentSummary, PaginationMeta } from '../../../../core/models';
import { DocumentService } from '../../../../core/services/document.service';
import { getApiErrorMessages } from '../../../../core/utils/api-error.util';
import { DOCUMENT_STATUS_LABEL } from '../../../../core/utils/document-status.util';
import { fileExtension } from '../../../../core/utils/format.util';

const PAGE_SIZE = 9;

type StatusFilter = 'ALL' | 'PENDING' | 'APPROVED';

interface StatusTab {
  value: StatusFilter;
  label: string;
}

const STATUS_TABS: StatusTab[] = [
  { value: 'ALL', label: 'Tất cả' },
  { value: 'PENDING', label: 'Chờ duyệt' },
  { value: 'APPROVED', label: 'Đã duyệt' },
];

const EMPTY_STATE: Record<StatusFilter, { title: string; hint: string }> = {
  ALL: {
    title: 'Bạn chưa chia sẻ tài liệu nào',
    hint: 'Tài liệu gửi lên sẽ nằm ở đây kèm trạng thái duyệt.',
  },
  PENDING: {
    title: 'Không có tài liệu nào đang chờ duyệt',
    hint: 'Bài vừa gửi sẽ xuất hiện ở đây cho tới khi admin xử lý.',
  },
  APPROVED: {
    title: 'Chưa có tài liệu nào được duyệt',
    hint: 'Tài liệu được duyệt sẽ hiển thị công khai với mọi sinh viên.',
  },
};

/**
 * Tài liệu đã chia sẻ — mọi trạng thái duyệt của tài liệu do chính người dùng đăng.
 * Tab trạng thái và số trang nằm trên URL nên Back/Forward và link chia sẻ hoạt động đúng.
 * Bài bị từ chối hiện lý do của admin, cho sửa nội dung / thay file rồi gửi duyệt lại
 * (backend đưa bài về PENDING và xoá lý do cũ), và cho xoá mềm sau khi xác nhận.
 */
@Component({
  selector: 'app-my-documents',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DatePipe],
  template: `
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Tài liệu đã chia sẻ</h1>
        <p class="mt-1 text-sm text-slate-500">
          Theo dõi trạng thái duyệt của từng tài liệu bạn đã đăng.
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <p class="text-sm text-slate-500">{{ rangeLabel() }}</p>
        <a routerLink="/upload" class="btn-primary w-auto">Đăng tài liệu</a>
      </div>
    </div>

    <div class="mt-6 flex flex-wrap gap-2">
      @for (tab of tabs; track tab.value) {
        <button
          type="button"
          [attr.aria-pressed]="status() === tab.value"
          [class]="
            status() === tab.value
              ? 'rounded-lg border border-indigo-600 bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white transition'
              : 'rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:border-indigo-300 hover:text-indigo-600'
          "
          (click)="setStatus(tab.value)"
        >
          {{ tab.label }}
        </button>
      }
    </div>

    @if (success()) {
      <div class="alert alert-success mt-6" role="status">
        <p>{{ success() }}</p>
      </div>
    }

    @if (errors().length > 0) {
      <div class="alert alert-error mt-6" role="alert">
        @for (error of errors(); track error) {
          <p>{{ error }}</p>
        }
      </div>
    }

    @if (loading()) {
      <div class="mt-6 grid gap-4 grid-cols-3" aria-busy="true">
        @for (placeholder of [1, 2, 3, 4, 5, 6]; track placeholder) {
          <div class="animate-pulse rounded-xl border border-slate-200 bg-white p-5">
            <div class="h-4 w-20 rounded bg-slate-200"></div>
            <div class="mt-3 h-5 w-3/4 rounded bg-slate-200"></div>
            <div class="mt-2 h-3 w-full rounded bg-slate-100"></div>
            <div class="mt-2 h-3 w-2/3 rounded bg-slate-100"></div>
            <div class="mt-5 h-3 w-1/2 rounded bg-slate-100"></div>
          </div>
        }
      </div>
    } @else if (items().length === 0) {
      <div class="mt-6 rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          class="mx-auto h-10 w-10 text-slate-300"
          aria-hidden="true"
        >
          <path
            d="M4 6.5A1.5 1.5 0 0 1 5.5 5h4l2 2.5h7A1.5 1.5 0 0 1 20 9v9.5A1.5 1.5 0 0 1 18.5 20h-13A1.5 1.5 0 0 1 4 18.5v-12Z"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linejoin="round"
          />
        </svg>
        <p class="mt-3 text-sm font-medium text-slate-700">{{ emptyState().title }}</p>
        <p class="mt-1 text-sm text-slate-500">{{ emptyState().hint }}</p>
        @if (status() === 'ALL') {
          <a routerLink="/upload" class="btn-primary mt-4 w-auto">Đăng tài liệu đầu tiên</a>
        }
      </div>
    } @else {
      <div class="mt-6 grid gap-4 grid-cols-3">
        @for (item of items(); track item.id) {
          <article
            class="group flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md"
          >
            <a [routerLink]="['/documents', item.id]" class="flex flex-1 flex-col">
              <div class="flex items-center justify-between gap-2">
                <span [class]="badgeClass(item.status)">{{ statusLabel(item.status) }}</span>
                <span class="text-xs text-slate-400">{{ item.createdAt | date: 'dd/MM/yyyy' }}</span>
              </div>

              <h2
                class="mt-3 line-clamp-2 text-base font-semibold text-slate-900 transition group-hover:text-indigo-700"
              >
                {{ item.title }}
              </h2>

              @if (item.description) {
                <p class="mt-1.5 line-clamp-2 text-sm text-slate-500">{{ item.description }}</p>
              }

              <p class="mt-3 text-xs font-medium text-indigo-600">
                {{ item.subject.code }} · {{ item.subject.name }}
              </p>

              @if (item.status === 'PENDING') {
                <p class="mt-3 text-xs text-amber-700">
                  Đang chờ admin duyệt — bạn sẽ thấy cập nhật ngay tại đây.
                </p>
              }

              @if (item.status === 'APPROVED' && item.publishedAt) {
                <p class="mt-3 text-xs text-emerald-700">
                  Công khai từ {{ item.publishedAt | date: 'dd/MM/yyyy' }}
                </p>
              }
            </a>

            <div class="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
              <div class="flex flex-wrap gap-1">
                @for (file of item.files; track file.url) {
                  <span
                    class="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600"
                  >
                    {{ fileType(file.name) }}
                  </span>
                }
              </div>

              <div class="flex shrink-0 flex-wrap items-center justify-end gap-3 text-xs">
                @if (item.status === 'APPROVED') {
                  <span class="flex items-center gap-1 text-slate-500">
                    <svg viewBox="0 0 20 20" fill="currentColor" class="h-3.5 w-3.5" aria-hidden="true">
                      <path
                        d="M10 4.5c-3.6 0-6.6 2.3-7.9 5.5 1.3 3.2 4.3 5.5 7.9 5.5s6.6-2.3 7.9-5.5C16.6 6.8 13.6 4.5 10 4.5Zm0 8.7a3.2 3.2 0 1 1 0-6.4 3.2 3.2 0 0 1 0 6.4Z"
                      />
                    </svg>
                    {{ item.viewCount }}
                  </span>
                }

                <a
                  [routerLink]="['/documents', item.id]"
                  class="font-semibold text-indigo-600 hover:text-indigo-700"
                >
                  Chi tiết →
                </a>

                <button
                  type="button"
                  class="font-semibold text-rose-600 transition hover:text-rose-700"
                  [attr.aria-label]="'Xoá ' + item.title"
                  (click)="askDelete(item)"
                >
                  Xoá
                </button>
              </div>
            </div>
          </article>
        }
      </div>
    }

    @if (meta().totalPages > 1) {
      <nav class="mt-8 flex items-center justify-center gap-1" aria-label="Phân trang tài liệu đã chia sẻ">
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

    @if (deleteTarget(); as target) {
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-document-title"
          class="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
        >
          <h2 id="delete-document-title" class="text-lg font-semibold text-slate-900">
            Xoá tài liệu?
          </h2>
          <p class="mt-2 text-sm leading-relaxed text-slate-600">
            “{{ target.title }}” sẽ bị xoá khỏi trang của bạn{{
              target.status === 'APPROVED' ? ' và khỏi danh sách công khai' : ''
            }}. Thao tác này không thể hoàn tác.
          </p>

          @if (deleteError()) {
            <div class="alert alert-error mt-4" role="alert">
              <p>{{ deleteError() }}</p>
            </div>
          }

          <div class="mt-6 flex justify-end gap-2">
            <button type="button" class="btn-secondary" [disabled]="deleting()" (click)="cancelDelete()">
              Huỷ
            </button>
            <button
              type="button"
              class="inline-flex items-center justify-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-rose-300"
              [disabled]="deleting()"
              (click)="confirmDelete()"
            >
              {{ deleting() ? 'Đang xoá…' : 'Xoá tài liệu' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class MyDocuments implements OnInit {
  private readonly documentsApi = inject(DocumentService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly tabs = STATUS_TABS;
  protected readonly status = signal<StatusFilter>('ALL');
  protected readonly items = signal<DocumentSummary[]>([]);
  protected readonly meta = signal<PaginationMeta>({
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
    totalPages: 0,
  });
  protected readonly loading = signal(true);
  protected readonly errors = signal<string[]>([]);
  protected readonly success = signal('');

  protected readonly deleteTarget = signal<DocumentSummary | null>(null);
  protected readonly deleting = signal(false);
  protected readonly deleteError = signal('');

  protected readonly emptyState = computed(() => EMPTY_STATE[this.status()]);

  protected readonly rangeLabel = computed(() => {
    const meta = this.meta();
    if (meta.total === 0) {
      return '0 tài liệu';
    }

    const from = (meta.page - 1) * meta.limit + 1;
    const to = Math.min(meta.page * meta.limit, meta.total);
    return `${from}–${to} trong ${meta.total} tài liệu`;
  });

  /** Tối đa 5 số trang quanh trang hiện tại. */
  protected readonly pages = computed(() => {
    const { page, totalPages } = this.meta();
    const start = Math.max(1, Math.min(page - 2, totalPages - 4));
    const end = Math.min(totalPages, start + 4);
    return Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => start + index);
  });

  ngOnInit(): void {
    // URL là nguồn dữ liệu duy nhất cho tab và số trang.
    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        this.readFilters(params);
        this.fetch(Math.max(1, Number(params.get('page')) || 1));
      });
  }

  protected setStatus(status: StatusFilter): void {
    if (this.status() === status) {
      return;
    }

    this.success.set('');

    void this.router.navigate([], {
      relativeTo: this.route,
      replaceUrl: true,
      queryParams: { status: status === 'ALL' ? null : status, page: null },
    });
  }

  protected goToPage(page: number): void {
    const meta = this.meta();
    if (page < 1 || page > meta.totalPages || page === meta.page) {
      return;
    }

    void this.router.navigate([], {
      relativeTo: this.route,
      replaceUrl: true,
      queryParams: { page: page > 1 ? page : null },
      queryParamsHandling: 'merge',
    });
  }

  protected askDelete(item: DocumentSummary): void {
    this.success.set('');
    this.deleteError.set('');
    this.deleteTarget.set(item);
  }

  protected cancelDelete(): void {
    if (this.deleting()) {
      return;
    }

    this.deleteTarget.set(null);
    this.deleteError.set('');
  }

  protected confirmDelete(): void {
    const target = this.deleteTarget();
    if (!target || this.deleting()) {
      return;
    }

    this.deleting.set(true);
    this.deleteError.set('');

    this.documentsApi
      .remove(target.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.deleting.set(false);
          this.deleteTarget.set(null);
          this.success.set(`Đã xoá “${target.title}”.`);
          this.fetch(this.meta().page);
        },
        error: (error: unknown) => {
          this.deleting.set(false);
          this.deleteError.set(getApiErrorMessages(error).join(' '));
        },
      });
  }

  protected statusLabel(status: DocumentStatus): string {
    return DOCUMENT_STATUS_LABEL[status];
  }

  protected badgeClass(status: DocumentStatus): string {
    if (status === 'APPROVED') {
      return 'rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700';
    }

    return 'rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700';
  }

  protected fileType(name: string): string {
    return fileExtension(name);
  }

  private readFilters(params: ParamMap): void {
    const status = params.get('status');
    this.status.set(status === 'PENDING' || status === 'APPROVED' ? status : 'ALL');
  }

  private fetch(page: number): void {
    const status = this.status();
    this.loading.set(true);
    this.errors.set([]);

    this.documentsApi
      .findMine({ status: status === 'ALL' ? undefined : status, page, limit: PAGE_SIZE })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          // Xoá bài cuối cùng của trang cuối: lùi về trang còn dữ liệu.
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
