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
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import {
  DocumentSummary,
  PaginationMeta,
  Subject as SubjectModel,
} from '../../../../core/models';
import { DocumentService } from '../../../../core/services/document.service';
import { SubjectService } from '../../../../core/services/subject.service';
import { getApiErrorMessages } from '../../../../core/utils/api-error.util';
import { fileExtension, initials } from '../../../../core/utils/format.util';

const PAGE_SIZE = 12;
const DEFAULT_SORT = 'createdAt:desc';

type SortValue = 'createdAt:desc' | 'viewCount:desc' | 'ratingAvg:desc';

function toggleValue(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

/**
 * Danh sách tài liệu đã duyệt.
 * Bộ lọc (từ khoá, môn học, loại file, sắp xếp, trang) sống trên URL nên
 * gửi link cho người khác là mở ra đúng kết quả, và nút Back hoạt động đúng.
 */
@Component({
  selector: 'app-document-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DatePipe],
  template: `
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Tài liệu</h1>
        <p class="mt-1 text-sm text-slate-500">
          Tài liệu đã được kiểm duyệt — tìm theo môn, loại file hoặc từ khoá.
        </p>
      </div>
      <p class="text-sm text-slate-500">{{ rangeLabel() }}</p>
    </div>

    <!-- Tìm kiếm -->
    <div class="relative mt-6 max-w-xl">
      <svg
        viewBox="0 0 20 20"
        fill="currentColor"
        class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
        aria-hidden="true"
      >
        <path
          fill-rule="evenodd"
          d="M9 3.5a5.5 5.5 0 1 0 3.4 9.8l3.15 3.15a.75.75 0 1 0 1.06-1.06l-3.15-3.15A5.5 5.5 0 0 0 9 3.5ZM5 9a4 4 0 1 1 8 0 4 4 0 0 1-8 0Z"
          clip-rule="evenodd"
        />
      </svg>
      <input
        type="search"
        class="field-input py-2.5 pl-9 pr-10"
        placeholder="Tìm theo tiêu đề hoặc mô tả…"
        aria-label="Tìm kiếm tài liệu"
        [value]="keyword()"
        (input)="onKeywordInput($event)"
      />
      @if (keyword()) {
        <button
          type="button"
          class="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          aria-label="Xoá từ khoá"
          (click)="clearKeyword()"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4" aria-hidden="true">
            <path
              d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z"
            />
          </svg>
        </button>
      }
    </div>

    <!-- Bộ lọc -->
    <div class="mt-4 rounded-xl border border-slate-200 bg-white p-4">
      <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Môn học</p>
      <div class="flex flex-wrap gap-2">
        @for (subject of subjects(); track subject.id) {
          <button
            type="button"
            [attr.aria-pressed]="selectedSubjects().includes(subject.id)"
            [class]="
              selectedSubjects().includes(subject.id)
                ? 'rounded-full border border-indigo-600 bg-indigo-600 px-3 py-1 text-xs font-medium text-white transition'
                : 'rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-600 transition hover:border-indigo-300 hover:text-indigo-600'
            "
            (click)="toggleSubject(subject.id)"
          >
            {{ subject.code }} · {{ subject.name }}
            <span class="opacity-60">({{ subject.documentCount }})</span>
          </button>
        }
        @if (subjects().length === 0) {
          <span class="text-xs text-slate-400">Chưa tải được danh mục môn học.</span>
        }
      </div>

      <div
        class="mt-4 flex flex-wrap items-end justify-between gap-4 border-t border-slate-100 pt-3"
      >
        <div class="flex flex-wrap gap-x-6 gap-y-3">
          <div>
            <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Loại file
            </p>
            <div class="flex gap-2">
              @for (type of fileTypes; track type.value) {
                <button
                  type="button"
                  [attr.aria-pressed]="selectedFileTypes().includes(type.value)"
                  [class]="
                    selectedFileTypes().includes(type.value)
                      ? 'rounded-lg border border-indigo-600 bg-indigo-600 px-3 py-1 text-xs font-medium text-white transition'
                      : 'rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-600 transition hover:border-indigo-300 hover:text-indigo-600'
                  "
                  (click)="toggleFileType(type.value)"
                >
                  {{ type.label }}
                </button>
              }
            </div>
          </div>

          <div>
            <label
              class="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500"
              for="sort"
            >
              Sắp xếp
            </label>
            <select id="sort" class="field-input w-auto py-1.5" (change)="changeSort($event)">
              @for (option of sortOptions; track option.value) {
                <!-- [selected] (không phải [value]) để dropdown khớp cả khi mở bằng URL -->
                <option [value]="option.value" [selected]="option.value === sort()">
                  {{ option.label }}
                </option>
              }
            </select>
          </div>
        </div>

        @if (hasFilters()) {
          <button
            type="button"
            class="text-xs font-semibold text-indigo-600 transition hover:text-indigo-700"
            (click)="clearFilters()"
          >
            Xoá bộ lọc
          </button>
        }
      </div>
    </div>

    @if (errors().length > 0) {
      <div class="alert alert-error mt-6" role="alert">
        @for (error of errors(); track error) {
          <p>{{ error }}</p>
        }
      </div>
    }

    @if (loading()) {
      <div class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
        @for (placeholder of [1, 2, 3, 4, 5, 6]; track placeholder) {
          <div class="animate-pulse rounded-xl border border-slate-200 bg-white p-5">
            <div class="h-4 w-14 rounded bg-slate-200"></div>
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
        <p class="mt-3 text-sm font-medium text-slate-700">Không tìm thấy tài liệu nào</p>
        <p class="mt-1 text-sm text-slate-500">Thử từ khoá khác hoặc bỏ bớt bộ lọc.</p>
        @if (hasFilters()) {
          <button type="button" class="btn-secondary mt-4" (click)="clearFilters()">
            Xoá bộ lọc
          </button>
        }
      </div>
    } @else {
      <div class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        @for (item of items(); track item.id) {
          <a
            [routerLink]="['/documents', item.id]"
            class="group flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md"
          >
            <div class="flex items-center justify-between gap-2">
              <span class="rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] font-bold text-indigo-600">
                {{ badge(item) }}
              </span>
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

            <div class="mt-auto flex items-center justify-between gap-3 pt-4">
              <div class="flex min-w-0 items-center gap-2">
                @if (item.author.avatarUrl) {
                  <img
                    [src]="item.author.avatarUrl"
                    alt=""
                    class="h-7 w-7 rounded-full object-cover"
                  />
                } @else {
                  <span
                    class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-500"
                  >
                    {{ authorInitials(item.author.fullName) }}
                  </span>
                }
                <span class="truncate text-xs text-slate-500">{{ item.author.fullName }}</span>
              </div>

              <span class="flex shrink-0 items-center gap-1 text-xs text-slate-500">
                <svg viewBox="0 0 20 20" fill="currentColor" class="h-3.5 w-3.5" aria-hidden="true">
                  <path
                    d="M10 4.5c-3.6 0-6.6 2.3-7.9 5.5 1.3 3.2 4.3 5.5 7.9 5.5s6.6-2.3 7.9-5.5C16.6 6.8 13.6 4.5 10 4.5Zm0 8.7a3.2 3.2 0 1 1 0-6.4 3.2 3.2 0 0 1 0 6.4Z"
                  />
                </svg>
                {{ item.viewCount }}
              </span>
            </div>

            @if (item.files.length > 1) {
              <p class="mt-2 text-[11px] text-slate-400">{{ item.files.length }} file đính kèm</p>
            }
          </a>
        }
      </div>
    }

    @if (meta().totalPages > 1) {
      <nav class="mt-8 flex items-center justify-center gap-1" aria-label="Phân trang tài liệu">
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
export class DocumentList implements OnInit {
  private readonly documentsApi = inject(DocumentService);
  private readonly subjectsApi = inject(SubjectService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly keywordInput = new Subject<string>();

  protected readonly items = signal<DocumentSummary[]>([]);
  protected readonly meta = signal<PaginationMeta>({
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
    totalPages: 0,
  });
  protected readonly loading = signal(true);
  protected readonly errors = signal<string[]>([]);
  protected readonly subjects = signal<SubjectModel[]>([]);
  protected readonly keyword = signal('');
  protected readonly selectedSubjects = signal<string[]>([]);
  protected readonly selectedFileTypes = signal<string[]>([]);
  protected readonly sort = signal<SortValue>(DEFAULT_SORT);

  protected readonly fileTypes = [
    { value: 'pdf', label: 'PDF' },
    { value: 'docx', label: 'DOCX' },
    { value: 'pptx', label: 'PPTX' },
  ];

  protected readonly sortOptions: { value: SortValue; label: string }[] = [
    { value: 'createdAt:desc', label: 'Mới nhất' },
    { value: 'viewCount:desc', label: 'Nhiều lượt xem' },
    { value: 'ratingAvg:desc', label: 'Đánh giá cao' },
  ];

  protected readonly hasFilters = computed(
    () =>
      this.keyword().trim().length > 0 ||
      this.selectedSubjects().length > 0 ||
      this.selectedFileTypes().length > 0,
  );

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

  constructor() {
    this.keywordInput
      .pipe(debounceTime(350), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((keyword) => this.applyFilters({ keyword, page: 1 }));
  }

  ngOnInit(): void {
    this.subjectsApi
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (subjects) => this.subjects.set(subjects),
        error: () => this.subjects.set([]),
      });

    // URL là nguồn dữ liệu duy nhất cho bộ lọc.
    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        this.readFilters(params);
        this.fetch(params);
      });
  }

  protected onKeywordInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.keyword.set(value);
    this.keywordInput.next(value);
  }

  protected clearKeyword(): void {
    this.keyword.set('');
    this.keywordInput.next('');
  }

  protected toggleSubject(subjectId: string): void {
    const next = toggleValue(this.selectedSubjects(), subjectId);
    this.selectedSubjects.set(next);
    this.applyFilters({ subjectIds: next, page: 1 });
  }

  protected toggleFileType(fileType: string): void {
    const next = toggleValue(this.selectedFileTypes(), fileType);
    this.selectedFileTypes.set(next);
    this.applyFilters({ fileTypes: next, page: 1 });
  }

  protected changeSort(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as SortValue;
    this.sort.set(value);
    this.applyFilters({ sort: value, page: 1 });
  }

  protected clearFilters(): void {
    this.keyword.set('');
    this.selectedSubjects.set([]);
    this.selectedFileTypes.set([]);
    this.sort.set(DEFAULT_SORT);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {},
      replaceUrl: true,
    });
  }

  protected goToPage(page: number): void {
    const meta = this.meta();
    if (page < 1 || page > meta.totalPages || page === meta.page) {
      return;
    }

    this.applyFilters({ page });
  }

  protected badge(item: DocumentSummary): string {
    return fileExtension(item.files[0]?.name ?? '');
  }

  protected authorInitials(fullName: string): string {
    return initials(fullName);
  }

  private readFilters(params: ParamMap): void {
    this.keyword.set(params.get('keyword') ?? '');
    this.selectedSubjects.set(params.getAll('subjectIds'));
    this.selectedFileTypes.set(params.getAll('fileTypes'));

    const sort = params.get('sort');
    this.sort.set(sort === 'viewCount:desc' || sort === 'ratingAvg:desc' ? sort : DEFAULT_SORT);
  }

  /** Ghi bộ lọc lên URL; subscription queryParamMap sẽ tải lại danh sách. */
  private applyFilters(overrides: {
    keyword?: string;
    subjectIds?: string[];
    fileTypes?: string[];
    sort?: SortValue;
    page?: number;
  }): void {
    const keyword = (overrides.keyword ?? this.keyword()).trim();
    const subjectIds = overrides.subjectIds ?? this.selectedSubjects();
    const fileTypes = overrides.fileTypes ?? this.selectedFileTypes();
    const sort = overrides.sort ?? this.sort();
    const page = overrides.page ?? this.meta().page;

    void this.router.navigate([], {
      relativeTo: this.route,
      replaceUrl: true,
      queryParams: {
        keyword: keyword.length > 0 ? keyword : null,
        subjectIds: subjectIds.length > 0 ? subjectIds : null,
        fileTypes: fileTypes.length > 0 ? fileTypes : null,
        sort: sort === DEFAULT_SORT ? null : sort,
        page: page > 1 ? page : null,
      },
    });
  }

  private fetch(params: ParamMap): void {
    const page = Math.max(1, Number(params.get('page') ?? '1') || 1);
    this.loading.set(true);
    this.errors.set([]);

    this.documentsApi
      .list({
        keyword: this.keyword().trim() || undefined,
        subjectIds: this.selectedSubjects(),
        fileTypes: this.selectedFileTypes(),
        sort: this.sort(),
        page,
        limit: PAGE_SIZE,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
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
