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
import {
  DocumentStatus,
  MyDocumentSummary,
  PaginationMeta,
  StoredFile,
  Subject,
} from '../../../../core/models';
import { DocumentService } from '../../../../core/services/document.service';
import { SubjectService } from '../../../../core/services/subject.service';
import { UploadService } from '../../../../core/services/upload.service';
import { getApiErrorMessages } from '../../../../core/utils/api-error.util';
import { fileExtension, formatFileSize, initials } from '../../../../core/utils/format.util';

const PAGE_SIZE = 9;
const MIN_TITLE_LENGTH = 5;
const MAX_FILE_MB = 20;
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;
const ALLOWED_EXTENSIONS = ['pdf', 'docx', 'pptx'];

type StatusFilter = 'ALL' | DocumentStatus;

interface StatusTab {
  value: StatusFilter;
  label: string;
}

const STATUS_TABS: StatusTab[] = [
  { value: 'ALL', label: 'Tất cả' },
  { value: 'PENDING', label: 'Chờ duyệt' },
  { value: 'APPROVED', label: 'Đã duyệt' },
  { value: 'REJECTED', label: 'Bị từ chối' },
];

const STATUS_LABEL: Record<DocumentStatus, string> = {
  PENDING: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Bị từ chối',
};

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
  REJECTED: {
    title: 'Không có tài liệu nào bị từ chối',
    hint: 'Nếu bài bị từ chối, lý do sẽ hiện ngay trên thẻ tài liệu.',
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
      <div class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
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
      <div class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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

              @if (item.status === 'REJECTED' && item.rejectReason) {
                <div class="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2">
                  <p class="text-[11px] font-semibold uppercase tracking-wide text-rose-700">
                    Lý do từ chối
                  </p>
                  <p class="mt-1 line-clamp-3 text-sm leading-relaxed text-rose-700">
                    {{ item.rejectReason }}
                  </p>
                </div>
              }

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

                @if (item.status === 'REJECTED') {
                  <button
                    type="button"
                    class="font-semibold text-indigo-600 transition hover:text-indigo-700"
                    [attr.aria-label]="'Sửa và gửi duyệt lại ' + item.title"
                    (click)="openEdit(item)"
                  >
                    Sửa &amp; gửi lại
                  </button>
                }

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

    @if (editTarget(); as target) {
      <div class="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:items-center">
        <form
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-document-title"
          class="my-auto w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"
          (submit)="submitEdit($event)"
        >
          <h2 id="edit-document-title" class="text-lg font-semibold text-slate-900">
            Sửa và gửi duyệt lại
          </h2>
          <p class="mt-1 text-sm text-slate-500">
            Chỉnh nội dung hoặc thay file, sau đó gửi lại hàng chờ duyệt. Bài sẽ quay về trạng thái
            “Chờ duyệt”.
          </p>

          @if (target.rejectReason) {
            <div class="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2">
              <p class="text-[11px] font-semibold uppercase tracking-wide text-rose-700">
                Lý do từ chối trước đó
              </p>
              <p class="mt-1 text-sm leading-relaxed text-rose-700">{{ target.rejectReason }}</p>
            </div>
          }

          @if (editErrors().length > 0) {
            <div class="alert alert-error mt-4" role="alert">
              @for (error of editErrors(); track error) {
                <p>{{ error }}</p>
              }
            </div>
          }

          <div class="mt-4">
            <label class="mb-1.5 block text-sm font-medium text-slate-700" for="edit-title">
              Tiêu đề <span class="text-rose-500">*</span>
            </label>
            <input
              id="edit-title"
              type="text"
              class="field-input"
              maxlength="200"
              [value]="editTitle()"
              (input)="editTitle.set(readValue($event))"
            />
            <p class="mt-1 text-xs text-slate-400">
              {{ editTitle().trim().length }}/200 ký tự — cần ít nhất {{ minTitleLength }} ký tự.
            </p>
          </div>

          <div class="mt-4">
            <label class="mb-1.5 block text-sm font-medium text-slate-700" for="edit-subject">
              Môn học <span class="text-rose-500">*</span>
            </label>
            <select
              id="edit-subject"
              class="field-input"
              (change)="editSubjectId.set(readValue($event))"
            >
              <option value="" [selected]="editSubjectId() === ''">— Chọn môn học —</option>
              @for (subject of subjects(); track subject.id) {
                <option [value]="subject.id" [selected]="subject.id === editSubjectId()">
                  {{ subject.code }} · {{ subject.name }}
                </option>
              }
            </select>
          </div>

          <div class="mt-4">
            <label class="mb-1.5 block text-sm font-medium text-slate-700" for="edit-description">
              Mô tả
            </label>
            <textarea
              id="edit-description"
              rows="3"
              class="field-input resize-y"
              maxlength="1000"
              [value]="editDescription()"
              (input)="editDescription.set(readValue($event))"
            ></textarea>
          </div>

          <div class="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p class="text-sm font-medium text-slate-700">File đính kèm</p>
            <ul class="mt-2 space-y-1">
              @for (file of target.files; track file.url) {
                <li class="flex items-center justify-between gap-2 text-xs text-slate-600">
                  <span class="truncate">{{ file.name }}</span>
                  <span class="shrink-0 text-slate-400">{{ size(file.size) }}</span>
                </li>
              }
            </ul>

            <label class="mt-3 inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-indigo-600 hover:text-indigo-700">
              <input
                type="file"
                class="sr-only"
                accept=".pdf,.docx,.pptx"
                (change)="onEditFileSelected($event)"
              />
              Thay bằng file mới (tuỳ chọn)
            </label>

            @if (editFile(); as file) {
              <p class="mt-2 flex items-center gap-2 text-xs text-emerald-700">
                <span class="truncate">{{ file.name }} · {{ size(file.size) }}</span>
                <button
                  type="button"
                  class="shrink-0 font-semibold text-slate-500 underline-offset-2 hover:underline"
                  (click)="clearEditFile()"
                >
                  Bỏ chọn
                </button>
              </p>
            }

            @if (editFileError()) {
              <p class="mt-2 text-xs text-rose-600">{{ editFileError() }}</p>
            }

            @if (editProgress()) {
              <p class="mt-2 text-xs text-slate-500">{{ editProgress() }}</p>
            }
          </div>

          <div class="mt-6 flex justify-end gap-2">
            <button
              type="button"
              class="btn-secondary"
              [disabled]="editSubmitting()"
              (click)="closeEdit()"
            >
              Huỷ
            </button>
            <button
              type="submit"
              class="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300"
              [disabled]="!canSubmitEdit()"
            >
              {{ editSubmitting() ? 'Đang gửi…' : 'Gửi duyệt lại' }}
            </button>
          </div>
        </form>
      </div>
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
  private readonly subjectsApi = inject(SubjectService);
  private readonly uploadsApi = inject(UploadService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly minTitleLength = MIN_TITLE_LENGTH;
  protected readonly tabs = STATUS_TABS;
  protected readonly status = signal<StatusFilter>('ALL');
  protected readonly items = signal<MyDocumentSummary[]>([]);
  protected readonly meta = signal<PaginationMeta>({
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
    totalPages: 0,
  });
  protected readonly loading = signal(true);
  protected readonly errors = signal<string[]>([]);
  protected readonly success = signal('');
  protected readonly subjects = signal<Subject[]>([]);

  protected readonly deleteTarget = signal<MyDocumentSummary | null>(null);
  protected readonly deleting = signal(false);
  protected readonly deleteError = signal('');

  protected readonly editTarget = signal<MyDocumentSummary | null>(null);
  protected readonly editTitle = signal('');
  protected readonly editDescription = signal('');
  protected readonly editSubjectId = signal('');
  protected readonly editFile = signal<File | null>(null);
  protected readonly editFileError = signal('');
  protected readonly editErrors = signal<string[]>([]);
  protected readonly editSubmitting = signal(false);
  protected readonly editProgress = signal('');

  protected readonly emptyState = computed(() => EMPTY_STATE[this.status()]);

  protected readonly canSubmitEdit = computed(
    () =>
      !this.editSubmitting() &&
      this.editTitle().trim().length >= MIN_TITLE_LENGTH &&
      this.editSubjectId() !== '',
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

  ngOnInit(): void {
    this.subjectsApi
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (subjects) => this.subjects.set(subjects),
        error: () => this.subjects.set([]),
      });

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

  protected readValue(event: Event): string {
    return (event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value;
  }

  protected openEdit(item: MyDocumentSummary): void {
    this.success.set('');
    this.editErrors.set([]);
    this.editFileError.set('');
    this.editProgress.set('');
    this.editFile.set(null);
    this.editTarget.set(item);
    this.editTitle.set(item.title);
    this.editDescription.set(item.description ?? '');
    this.editSubjectId.set(item.subject.id);
  }

  protected closeEdit(): void {
    if (this.editSubmitting()) {
      return;
    }

    this.editTarget.set(null);
    this.editErrors.set([]);
    this.editFileError.set('');
    this.editProgress.set('');
  }

  protected onEditFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    this.editFileError.set('');

    if (!file) {
      return;
    }

    const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      this.editFileError.set(`"${file.name}": chỉ nhận file PDF, DOCX, PPTX.`);
      this.editFile.set(null);
      return;
    }

    if (file.size === 0) {
      this.editFileError.set(`"${file.name}" là file rỗng.`);
      this.editFile.set(null);
      return;
    }

    if (file.size > MAX_FILE_BYTES) {
      this.editFileError.set(
        `"${file.name}" nặng ${formatFileSize(file.size)} — vượt quá ${MAX_FILE_MB}MB.`,
      );
      this.editFile.set(null);
      return;
    }

    this.editFile.set(file);
  }

  protected clearEditFile(): void {
    this.editFile.set(null);
    this.editFileError.set('');
  }

  protected submitEdit(event: Event): void {
    event.preventDefault();

    const target = this.editTarget();
    if (!target || this.editSubmitting()) {
      return;
    }

    this.editErrors.set([]);

    const title = this.editTitle().trim();
    const subjectId = this.editSubjectId();

    if (title.length < MIN_TITLE_LENGTH) {
      this.editErrors.set([`Tiêu đề cần ít nhất ${MIN_TITLE_LENGTH} ký tự.`]);
      return;
    }

    if (!subjectId) {
      this.editErrors.set(['Chọn môn học cho tài liệu.']);
      return;
    }

    this.editSubmitting.set(true);
    const file = this.editFile();

    if (!file) {
      this.sendResubmit(target, title, subjectId, null);
      return;
    }

    this.editProgress.set(`Đang tải ${file.name}…`);
    this.uploadsApi
      .upload(file, 'documents')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (stored) => {
          this.editProgress.set('Đang gửi duyệt lại…');
          this.sendResubmit(target, title, subjectId, stored);
        },
        error: (error: unknown) => {
          this.editErrors.set(getApiErrorMessages(error));
          this.finishEdit();
        },
      });
  }

  protected askDelete(item: MyDocumentSummary): void {
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
    return STATUS_LABEL[status];
  }

  protected badgeClass(status: DocumentStatus): string {
    if (status === 'APPROVED') {
      return 'rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700';
    }

    if (status === 'REJECTED') {
      return 'rounded-md bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700';
    }

    return 'rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700';
  }

  protected fileType(name: string): string {
    return fileExtension(name);
  }

  protected size(bytes: number): string {
    return formatFileSize(bytes);
  }

  protected authorInitials(fullName: string): string {
    return initials(fullName);
  }

  private sendResubmit(
    target: MyDocumentSummary,
    title: string,
    subjectId: string,
    stored: StoredFile | null,
  ): void {
    const description = this.editDescription().trim();

    this.documentsApi
      .resubmit(target.id, {
        title,
        description: description || undefined,
        subjectId,
        files: stored ? [stored] : undefined,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.finishEdit();
          this.editTarget.set(null);
          this.editFile.set(null);
          this.success.set(`Đã gửi duyệt lại “${title}”. Tài liệu đang chờ admin xem xét.`);
          this.fetch(this.meta().page);
        },
        error: (error: unknown) => {
          this.editErrors.set(getApiErrorMessages(error));
          this.finishEdit();
        },
      });
  }

  private finishEdit(): void {
    this.editSubmitting.set(false);
    this.editProgress.set('');
  }

  private readFilters(params: ParamMap): void {
    const status = params.get('status');
    this.status.set(
      status === 'PENDING' || status === 'APPROVED' || status === 'REJECTED' ? status : 'ALL',
    );
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
