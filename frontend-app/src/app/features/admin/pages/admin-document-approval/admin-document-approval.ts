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
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import {
  DocumentFile,
  DocumentStatus,
  DocumentSummary,
  PaginationMeta,
} from '../../../../core/models';
import { AdminService } from '../../../../core/services/admin.service';
import { getApiErrorMessages } from '../../../../core/utils/api-error.util';
import { fileExtension, formatFileSize, initials } from '../../../../core/utils/format.util';

const PAGE_SIZE = 10;
const MIN_REJECT_REASON = 10;

type StatusTab = { value: DocumentStatus; label: string; hint: string };

/**
 * Phê duyệt bài viết (admin).
 *
 * Danh sách theo trạng thái + panel xem trước: PDF hiển thị ngay trong iframe
 * (file phục vụ từ /api/files), DOCX/PPTX mở ở tab mới. Duyệt hoặc từ chối kèm
 * lý do; lý do được lưu vào tài liệu để tác giả thấy ở trang chi tiết.
 */
@Component({
  selector: 'app-admin-document-approval',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DatePipe],
  template: `
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Phê duyệt bài viết</h1>
        <p class="mt-1 text-sm text-slate-500">
          Kiểm tra nội dung và file trước khi cho tài liệu hiển thị công khai.
        </p>
      </div>
      <p class="text-sm text-slate-500">{{ meta().total }} tài liệu · trang {{ meta().page }}/{{ meta().totalPages || 1 }}</p>
    </div>

    <!-- Tabs trạng thái -->
    <div class="mt-5 flex flex-wrap gap-2">
      @for (tab of tabs; track tab.value) {
        <button
          type="button"
          [attr.aria-pressed]="status() === tab.value"
          [class]="
            status() === tab.value
              ? 'rounded-lg border border-indigo-600 bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white'
              : 'rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:border-indigo-300 hover:text-indigo-600'
          "
          (click)="setStatus(tab.value)"
        >
          {{ tab.label }}
        </button>
      }
    </div>

    @if (success()) {
      <div class="alert alert-success mt-5" role="status">
        <p>{{ success() }}</p>
      </div>
    }

    @if (errors().length > 0) {
      <div class="alert alert-error mt-5" role="alert">
        @for (error of errors(); track error) {
          <p>{{ error }}</p>
        }
      </div>
    }

    @if (loading()) {
      <div class="mt-6 grid gap-6 lg:grid-cols-5" aria-busy="true">
        <div class="animate-pulse space-y-3 lg:col-span-2">
          @for (placeholder of [1, 2, 3, 4]; track placeholder) {
            <div class="rounded-xl border border-slate-200 bg-white p-4">
              <div class="h-4 w-3/4 rounded bg-slate-200"></div>
              <div class="mt-2 h-3 w-1/2 rounded bg-slate-100"></div>
              <div class="mt-3 h-3 w-2/3 rounded bg-slate-100"></div>
            </div>
          }
        </div>
        <div class="animate-pulse rounded-xl border border-slate-200 bg-white p-6 lg:col-span-3">
          <div class="h-5 w-2/3 rounded bg-slate-200"></div>
          <div class="mt-3 h-3 w-1/3 rounded bg-slate-100"></div>
          <div class="mt-6 h-72 w-full rounded bg-slate-100"></div>
        </div>
      </div>
    } @else if (items().length === 0) {
      <div class="mt-6 rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
        <p class="text-sm font-medium text-slate-700">
          {{ status() === 'PENDING' ? 'Không có bài nào chờ duyệt' : 'Chưa có tài liệu ở trạng thái này' }}
        </p>
        <p class="mt-1 text-sm text-slate-500">
          {{ status() === 'PENDING' ? 'Bài mới gửi sẽ xuất hiện ở đây.' : 'Chuyển tab để xem trạng thái khác.' }}
        </p>
      </div>
    } @else {
      <div class="mt-6 grid gap-6 lg:grid-cols-5">
        <!-- Danh sách -->
        <div class="space-y-3 lg:col-span-2">
          @for (item of items(); track item.id) {
            <button
              type="button"
              class="w-full rounded-xl border bg-white p-4 text-left transition"
              [class]="
                selected()?.id === item.id
                  ? 'border-indigo-400 ring-2 ring-indigo-100'
                  : 'border-slate-200 hover:border-indigo-200 hover:shadow-sm'
              "
              (click)="select(item)"
            >
              <div class="flex items-start justify-between gap-2">
                <h2 class="line-clamp-2 text-sm font-semibold text-slate-900">{{ item.title }}</h2>
                <span
                  [class]="
                    item.status === 'PENDING'
                      ? 'shrink-0 rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700'
                      : item.status === 'APPROVED'
                        ? 'shrink-0 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700'
                        : 'shrink-0 rounded-md bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700'
                  "
                >
                  {{ statusLabel(item.status) }}
                </span>
              </div>

              <p class="mt-2 text-xs text-indigo-600">
                {{ item.subject.code }} · {{ item.subject.name }}
              </p>

              <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                <span class="inline-flex items-center gap-1.5">
                  <span
                    class="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[9px] font-semibold text-slate-500"
                  >
                    {{ authorInitials(item.author.fullName) }}
                  </span>
                  {{ item.author.fullName }}
                </span>
                <span>{{ item.createdAt | date: 'dd/MM/yyyy' }}</span>
                <span>{{ item.viewCount }} lượt xem</span>
              </div>

              <div class="mt-2 flex flex-wrap gap-1">
                @for (file of item.files; track file.url) {
                  <span class="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                    {{ fileTypeName(file) }}
                  </span>
                }
              </div>
            </button>
          }

          @if (meta().totalPages > 1) {
            <nav class="flex items-center justify-center gap-2 pt-2" aria-label="Phân trang duyệt bài">
              <button
                type="button"
                class="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
                [disabled]="meta().page <= 1"
                aria-label="Trang trước"
                (click)="goToPage(meta().page - 1)"
              >
                ‹
              </button>
              <span class="text-sm text-slate-500">{{ meta().page }}/{{ meta().totalPages }}</span>
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
        </div>

        <!-- Xem trước -->
        <div class="lg:col-span-3">
          @if (selected(); as item) {
            <section class="rounded-xl border border-slate-200 bg-white p-5">
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div class="min-w-0">
                  <h2 class="text-lg font-semibold text-slate-900">{{ item.title }}</h2>
                  <p class="mt-1 text-xs text-slate-500">
                    {{ item.subject.code }} · {{ item.subject.name }} · {{ item.createdAt | date: 'dd/MM/yyyy' }}
                  </p>
                </div>
                <a
                  [routerLink]="['/documents', item.id]"
                  class="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                >
                  Mở trang chi tiết ↗
                </a>
              </div>

              @if (item.description) {
                <p class="mt-3 text-sm leading-relaxed text-slate-600">{{ item.description }}</p>
              }

              <div class="mt-4 flex flex-wrap gap-2">
                @for (file of item.files; track file.url; let index = $index) {
                  <button
                    type="button"
                    [attr.aria-pressed]="selectedFileIndex() === index"
                    [class]="
                      selectedFileIndex() === index
                        ? 'rounded-lg border border-indigo-600 bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white'
                        : 'rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-indigo-300'
                    "
                    (click)="selectedFileIndex.set(index)"
                  >
                    {{ file.name }} · {{ size(file) }}
                  </button>
                }
              </div>

              @if (previewUrl(); as url) {
                <iframe
                  [src]="url"
                  [title]="'Xem trước ' + (selectedFile()?.name ?? 'tài liệu')"
                  class="mt-4 h-[420px] w-full rounded-lg border border-slate-200 bg-slate-50"
                ></iframe>
                <p class="mt-2 text-xs text-slate-400">
                  PDF hiển thị trực tiếp. Nếu khung trống, trình duyệt không có trình đọc PDF —
                  <a [href]="selectedFile()?.url" target="_blank" rel="noopener noreferrer" class="text-indigo-600">
                    mở file ở tab mới
                  </a>.
                </p>
              } @else if (selectedFile(); as file) {
                <div class="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
                  <p class="text-sm font-medium text-slate-700">Không xem trước được {{ fileTypeName(file) }}</p>
                  <p class="mt-1 text-xs text-slate-500">
                    Định dạng này cần tải về để mở bằng Word/PowerPoint.
                  </p>
                  <a
                    [href]="file.url"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="btn-secondary mt-4"
                  >
                    Mở file ở tab mới
                  </a>
                </div>
              } @else {
                <p class="mt-4 text-sm text-slate-500">Tài liệu không có file đính kèm.</p>
              }

              <div class="mt-5 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
                @if (item.status !== 'APPROVED') {
                  <button
                    type="button"
                    class="btn-primary w-auto"
                    [disabled]="busyId() !== null"
                    (click)="approve(item)"
                  >
                    {{ busyId() === item.id ? 'Đang duyệt…' : 'Duyệt tài liệu' }}
                  </button>
                } @else {
                  <p class="text-sm font-medium text-emerald-700">Tài liệu đã được duyệt.</p>
                }

                @if (item.status !== 'REJECTED') {
                  <button
                    type="button"
                    class="btn-secondary text-rose-600"
                    [disabled]="busyId() !== null"
                    (click)="openReject(item)"
                  >
                    Từ chối…
                  </button>
                } @else {
                  <p class="text-sm font-medium text-rose-700">Tài liệu đã bị từ chối.</p>
                }
              </div>
            </section>
          } @else {
            <div class="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
              <p class="text-sm font-medium text-slate-700">Chọn một tài liệu để xem trước</p>
              <p class="mt-1 text-sm text-slate-500">
                Bấm vào thẻ bên trái để xem file, mô tả và duyệt bài.
              </p>
            </div>
          }
        </div>
      </div>
    }

    <!-- Hộp thoại từ chối -->
    @if (rejectTarget(); as target) {
      <div class="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-4">
        <div class="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl" role="dialog" aria-modal="true">
          <h2 class="text-lg font-semibold text-slate-900">Từ chối tài liệu</h2>
          <p class="mt-1 line-clamp-2 text-sm text-slate-500">{{ target.title }}</p>

          <label class="mt-4 block text-sm font-medium text-slate-700" for="reject-reason">
            Lý do gửi cho tác giả <span class="text-rose-500">*</span>
          </label>
          <textarea
            id="reject-reason"
            rows="4"
            class="field-input mt-1 resize-y"
            maxlength="500"
            placeholder="Ví dụ: File PDF bị mờ, không đọc được nội dung. Vui lòng tải lại bản rõ hơn."
            [value]="rejectReason()"
            (input)="rejectReason.set(readValue($event))"
          ></textarea>
          <p class="mt-1 text-xs text-slate-400">
            {{ rejectReason().trim().length }}/500 ký tự — cần ít nhất {{ minRejectReason }} ký tự.
          </p>

          @if (rejectError()) {
            <p class="mt-2 text-sm text-rose-600" role="alert">{{ rejectError() }}</p>
          }

          <div class="mt-5 flex justify-end gap-3">
            <button type="button" class="btn-secondary" (click)="closeReject()">Huỷ</button>
            <button
              type="button"
              class="btn-primary w-auto bg-rose-600 hover:bg-rose-700"
              [disabled]="busyId() !== null || rejectReason().trim().length < minRejectReason"
              (click)="confirmReject()"
            >
              {{ busyId() === target.id ? 'Đang gửi…' : 'Xác nhận từ chối' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class AdminDocumentApproval implements OnInit {
  private readonly adminApi = inject(AdminService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly sanitizer = inject(DomSanitizer);

  protected readonly minRejectReason = MIN_REJECT_REASON;

  protected readonly tabs: StatusTab[] = [
    { value: 'PENDING', label: 'Chờ duyệt', hint: 'Cần xử lý' },
    { value: 'APPROVED', label: 'Đã duyệt', hint: 'Đang công khai' },
    { value: 'REJECTED', label: 'Bị từ chối', hint: 'Đã trả về tác giả' },
  ];

  protected readonly status = signal<DocumentStatus>('PENDING');
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
  protected readonly selected = signal<DocumentSummary | null>(null);
  protected readonly selectedFileIndex = signal(0);
  protected readonly busyId = signal<string | null>(null);
  protected readonly rejectTarget = signal<DocumentSummary | null>(null);
  protected readonly rejectReason = signal('');
  protected readonly rejectError = signal('');

  protected readonly selectedFile = computed<DocumentFile | null>(() => {
    const item = this.selected();
    return item?.files[this.selectedFileIndex()] ?? null;
  });

  protected readonly previewUrl = computed<SafeResourceUrl | null>(() => {
    const file = this.selectedFile();
    if (!file || fileExtension(file.name) !== 'PDF') {
      return null;
    }

    return this.sanitizer.bypassSecurityTrustResourceUrl(file.url);
  });

  ngOnInit(): void {
    this.fetch(1);
  }

  protected setStatus(status: DocumentStatus): void {
    if (this.status() === status) {
      return;
    }

    this.status.set(status);
    this.selected.set(null);
    this.success.set('');
    this.fetch(1);
  }

  protected select(item: DocumentSummary): void {
    this.selected.set(item);
    this.selectedFileIndex.set(0);
  }

  protected statusLabel(status: DocumentStatus): string {
    return this.tabs.find((tab) => tab.value === status)?.label ?? status;
  }

  protected fileTypeName(file: DocumentFile): string {
    return fileExtension(file.name);
  }

  protected size(file: DocumentFile): string {
    return formatFileSize(file.size);
  }

  protected authorInitials(fullName: string): string {
    return initials(fullName);
  }

  protected readValue(event: Event): string {
    return (event.target as HTMLTextAreaElement).value;
  }

  protected goToPage(page: number): void {
    const meta = this.meta();
    if (page < 1 || page > meta.totalPages || page === meta.page) {
      return;
    }

    this.selected.set(null);
    this.fetch(page);
  }

  protected approve(item: DocumentSummary): void {
    if (this.busyId()) {
      return;
    }

    this.busyId.set(item.id);
    this.errors.set([]);
    this.success.set('');

    this.adminApi
      .approveDocument(item.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.busyId.set(null);
          this.success.set(`Đã duyệt "${item.title}" — tài liệu đã hiển thị công khai.`);
          this.selected.set(null);
          this.fetch(this.meta().page);
        },
        error: (error: unknown) => {
          this.busyId.set(null);
          this.errors.set(getApiErrorMessages(error));
        },
      });
  }

  protected openReject(item: DocumentSummary): void {
    this.rejectTarget.set(item);
    this.rejectReason.set('');
    this.rejectError.set('');
  }

  protected closeReject(): void {
    if (this.busyId()) {
      return;
    }

    this.rejectTarget.set(null);
    this.rejectReason.set('');
    this.rejectError.set('');
  }

  protected confirmReject(): void {
    const target = this.rejectTarget();
    const reason = this.rejectReason().trim();

    if (!target) {
      return;
    }

    if (reason.length < MIN_REJECT_REASON) {
      this.rejectError.set(`Lý do cần ít nhất ${MIN_REJECT_REASON} ký tự để tác giả biết cần sửa gì.`);
      return;
    }

    this.busyId.set(target.id);
    this.rejectError.set('');

    this.adminApi
      .rejectDocument(target.id, reason)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.busyId.set(null);
          this.rejectTarget.set(null);
          this.rejectReason.set('');
          this.success.set(`Đã từ chối "${target.title}" và gửi lý do cho tác giả.`);
          this.selected.set(null);
          this.fetch(this.meta().page);
        },
        error: (error: unknown) => {
          this.busyId.set(null);
          this.rejectError.set(getApiErrorMessages(error).join(' '));
        },
      });
  }

  private fetch(page: number): void {
    this.loading.set(true);
    this.errors.set([]);

    this.adminApi
      .documents({ status: this.status(), page, limit: PAGE_SIZE })
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
