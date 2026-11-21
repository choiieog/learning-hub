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
import { DocumentStatus, DocumentSummary, PaginationMeta } from '../../../core/models';
import { DocumentService } from '../../../core/services/document.service';
import { getApiErrorMessages } from '../../../core/utils/api-error.util';
import { DOCUMENT_STATUS_LABEL } from '../../../core/utils/document-status.util';
import { fileExtension } from '../../../core/utils/format.util';

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
  templateUrl: './my-documents.html',
  styleUrl: './my-documents.css',
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
