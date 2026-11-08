import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DocumentDetail, DocumentFile, DocumentStatus } from '../../../../core/models';
import { AuthService } from '../../../../core/services/auth.service';
import { DocumentService } from '../../../../core/services/document.service';
import { getApiErrorMessages } from '../../../../core/utils/api-error.util';
import { fileExtension, formatFileSize, initials } from '../../../../core/utils/format.util';
import { RatingSection } from '../../../ratings/components/rating-section/rating-section';

const STATUS_LABEL: Record<DocumentStatus, string> = {
  PENDING: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Bị từ chối',
};

/**
 * Chi tiết tài liệu.
 *
 * Mỗi lần mở trang gọi GET /documents/:id; backend tự ghi nhận lượt xem và
 * khử trùng theo (người xem, ngày) nên tải lại trang không làm tăng view.
 * Trang cũng báo khi lượt xem hôm nay đã được tính trước đó.
 */
@Component({
  selector: 'app-document-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DatePipe, RatingSection],
  template: `
    <a
      routerLink="/documents"
      class="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-indigo-600"
    >
      <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4" aria-hidden="true">
        <path
          fill-rule="evenodd"
          d="M12.79 5.23a.75.75 0 0 1-.02 1.06L8.83 10l3.94 3.71a.75.75 0 1 1-1.04 1.08l-4.5-4.25a.75.75 0 0 1 0-1.08l4.5-4.25a.75.75 0 0 1 1.06.02Z"
          clip-rule="evenodd"
        />
      </svg>
      Tất cả tài liệu
    </a>

    @if (loading()) {
      <div class="mt-4 animate-pulse rounded-2xl border border-slate-200 bg-white p-6 sm:p-8" aria-busy="true">
        <div class="h-4 w-16 rounded bg-slate-200"></div>
        <div class="mt-4 h-8 w-3/4 rounded bg-slate-200"></div>
        <div class="mt-3 h-4 w-full rounded bg-slate-100"></div>
        <div class="mt-2 h-4 w-2/3 rounded bg-slate-100"></div>
        <div class="mt-6 h-4 w-1/2 rounded bg-slate-100"></div>
      </div>
      <div class="mt-6 grid gap-6 lg:grid-cols-3">
        <div class="animate-pulse rounded-xl border border-slate-200 bg-white p-6 lg:col-span-2">
          <div class="h-4 w-32 rounded bg-slate-200"></div>
          <div class="mt-4 h-12 w-full rounded bg-slate-100"></div>
          <div class="mt-2 h-12 w-full rounded bg-slate-100"></div>
        </div>
        <div class="animate-pulse rounded-xl border border-slate-200 bg-white p-6">
          <div class="h-4 w-24 rounded bg-slate-200"></div>
          <div class="mt-4 h-10 w-40 rounded bg-slate-100"></div>
        </div>
      </div>
    } @else if (errors().length > 0) {
      <div class="mt-6 rounded-xl border border-slate-200 bg-white p-10 text-center">
        <p class="text-base font-semibold text-slate-800">Không mở được tài liệu</p>
        <div class="alert alert-error mx-auto mt-4 max-w-lg text-left" role="alert">
          @for (error of errors(); track error) {
            <p>{{ error }}</p>
          }
        </div>
        <div class="mt-5 flex flex-wrap items-center justify-center gap-3">
          <button type="button" class="btn-secondary" (click)="retry()">Thử lại</button>
          <a routerLink="/documents" class="text-sm font-semibold text-indigo-600">Về danh sách</a>
        </div>
      </div>
    } @else if (item(); as doc) {
      <article class="mt-4">
        <section class="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
          <div class="flex flex-wrap items-center gap-2">
            @for (type of fileTypes(doc.files); track type) {
              <span class="rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] font-bold text-indigo-600">
                {{ type }}
              </span>
            }
            @if (doc.status !== 'APPROVED') {
              <span
                [class]="
                  doc.status === 'PENDING'
                    ? 'rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700'
                    : 'rounded-md bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700'
                "
              >
                {{ statusLabel(doc.status) }}
              </span>
            }
          </div>

          <h1 class="mt-3 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            {{ doc.title }}
          </h1>

          @if (doc.description) {
            <p class="mt-3 max-w-3xl text-base leading-relaxed text-slate-600">
              {{ doc.description }}
            </p>
          }

          <div class="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3 text-sm text-slate-500">
            <a
              [routerLink]="['/documents']"
              [queryParams]="{ subjectIds: doc.subject.id }"
              class="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100"
            >
              {{ doc.subject.code }} · {{ doc.subject.name }}
            </a>

            <span class="inline-flex items-center gap-2">
              @if (doc.author.avatarUrl) {
                <img [src]="doc.author.avatarUrl" alt="" class="h-6 w-6 rounded-full object-cover" />
              } @else {
                <span
                  class="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-500"
                >
                  {{ authorInitials(doc.author.fullName) }}
                </span>
              }
              {{ doc.author.fullName }}
            </span>

            <span class="inline-flex items-center gap-1.5">
              <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4" aria-hidden="true">
                <path
                  d="M6 2.75a.75.75 0 0 0 0 1.5h.5v3.19a2.75 2.75 0 0 0 .62 1.74l2.38 2.82-2.38 2.82a2.75 2.75 0 0 0-.62 1.74v.44H6a.75.75 0 0 0 0 1.5h8a.75.75 0 0 0 0-1.5h-.5v-.44a2.75 2.75 0 0 0-.62-1.74l-2.38-2.82 2.38-2.82a2.75 2.75 0 0 0 .62-1.74V4.25H14a.75.75 0 0 0 0-1.5H6Z"
                />
              </svg>
              {{ (doc.publishedAt || doc.createdAt) | date: 'dd/MM/yyyy' }}
            </span>

            <span class="inline-flex items-center gap-1.5">
              <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4" aria-hidden="true">
                <path
                  d="M10 4.5c-3.6 0-6.6 2.3-7.9 5.5 1.3 3.2 4.3 5.5 7.9 5.5s6.6-2.3 7.9-5.5C16.6 6.8 13.6 4.5 10 4.5Zm0 8.7a3.2 3.2 0 1 1 0-6.4 3.2 3.2 0 0 1 0 6.4Z"
                />
              </svg>
              {{ doc.viewCount }} lượt xem
            </span>

            @if (doc.ratingCount > 0) {
              <span class="inline-flex items-center gap-1.5">
                <span class="text-amber-500" aria-hidden="true">★</span>
                {{ ratingLabel(doc.ratingAvg) }} ({{ doc.ratingCount }})
              </span>
            }
          </div>

          @if (doc.rejectReason) {
            <div class="alert mt-5 border border-rose-200 bg-rose-50 text-rose-700" role="status">
              <p class="font-semibold">Tài liệu bị từ chối</p>
              <p class="mt-1">{{ doc.rejectReason }}</p>
            </div>
          }

          @if (doc.status === 'APPROVED' && doc.viewCountedToday === false) {
            <p class="mt-4 text-xs text-slate-400">
              Bạn đã xem tài liệu này hôm nay — lượt xem chỉ được tính một lần mỗi ngày.
            </p>
          }
        </section>

        <div class="mt-6 grid gap-6 lg:grid-cols-3">
          <div class="space-y-6 lg:col-span-2">
            <section class="rounded-xl border border-slate-200 bg-white p-6">
              <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Tệp đính kèm ({{ doc.files.length }})
              </h2>

              @if (doc.files.length === 0) {
                <p class="mt-4 text-sm text-slate-500">Tài liệu này chưa có tệp đính kèm.</p>
              } @else {
                <ul class="mt-4 divide-y divide-slate-100">
                  @for (file of doc.files; track file.url) {
                    <li class="flex flex-wrap items-center justify-between gap-3 py-3">
                      <div class="flex min-w-0 items-center gap-3">
                        <span
                          class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[10px] font-bold text-slate-500"
                        >
                          {{ fileType(file) }}
                        </span>
                        <div class="min-w-0">
                          <p class="truncate text-sm font-medium text-slate-800">{{ file.name }}</p>
                          <p class="text-xs text-slate-500">{{ fileSize(file.size) }}</p>
                        </div>
                      </div>

                      <a
                        [href]="file.url"
                        [attr.download]="file.name"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="btn-secondary shrink-0"
                      >
                        <svg
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          class="mr-1.5 inline h-4 w-4"
                          aria-hidden="true"
                        >
                          <path
                            d="M10 2.5a.75.75 0 0 1 .75.75v8.19l2.22-2.22a.75.75 0 1 1 1.06 1.06l-3.5 3.5a.75.75 0 0 1-1.06 0l-3.5-3.5a.75.75 0 1 1 1.06-1.06l2.22 2.22V3.25A.75.75 0 0 1 10 2.5ZM4.5 15.5a.75.75 0 0 1 .75.75v.25h9.5v-.25a.75.75 0 0 1 1.5 0v.5a1.5 1.5 0 0 1-1.5 1.5H5.25a1.5 1.5 0 0 1-1.5-1.5v-.5a.75.75 0 0 1 .75-.75Z"
                          />
                        </svg>
                        Tải xuống
                      </a>
                    </li>
                  }
                </ul>
                <p class="mt-3 text-xs text-slate-400">
                  Tệp mở ở thẻ mới. Nếu trình duyệt chặn tải, bấm chuột phải vào nút và chọn “Lưu liên kết
                  thành…”.
                </p>
              }
            </section>

            @if (doc.content) {
              <section class="rounded-xl border border-slate-200 bg-white p-6">
                <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500">Nội dung</h2>
                <div class="mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-700">
                  {{ doc.content }}
                </div>
              </section>
            }

            @if (doc.status === 'APPROVED') {
              <app-rating-section
                [documentId]="doc.id"
                [canRate]="doc.author.id !== currentUser()?.id"
              />
            }
          </div>

          <aside class="space-y-6">
            <section class="rounded-xl border border-slate-200 bg-white p-6">
              <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Người chia sẻ
              </h2>
              <div class="mt-4 flex items-center gap-3">
                @if (doc.author.avatarUrl) {
                  <img
                    [src]="doc.author.avatarUrl"
                    alt=""
                    class="h-11 w-11 rounded-full object-cover"
                  />
                } @else {
                  <span
                    class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-500"
                  >
                    {{ authorInitials(doc.author.fullName) }}
                  </span>
                }
                <div class="min-w-0">
                  <p class="truncate text-sm font-semibold text-slate-900">{{ doc.author.fullName }}</p>
                  <p class="text-xs text-slate-500">Cấp {{ doc.author.level }}</p>
                </div>
              </div>
            </section>

            <section class="rounded-xl border border-slate-200 bg-white p-6">
              <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500">Thông tin</h2>
              <dl class="mt-4 space-y-3 text-sm">
                <div class="flex items-center justify-between gap-3">
                  <dt class="text-slate-500">Lượt xem</dt>
                  <dd class="font-medium text-slate-800">{{ doc.viewCount }}</dd>
                </div>
                <div class="flex items-center justify-between gap-3">
                  <dt class="text-slate-500">Số tệp</dt>
                  <dd class="font-medium text-slate-800">{{ doc.files.length }}</dd>
                </div>
                <div class="flex items-center justify-between gap-3">
                  <dt class="text-slate-500">Ngày đăng</dt>
                  <dd class="font-medium text-slate-800">
                    {{ (doc.publishedAt || doc.createdAt) | date: 'dd/MM/yyyy' }}
                  </dd>
                </div>
                @if (doc.ratingCount > 0) {
                  <div class="flex items-center justify-between gap-3">
                    <dt class="text-slate-500">Đánh giá</dt>
                    <dd class="font-medium text-slate-800">
                      ★ {{ ratingLabel(doc.ratingAvg) }} ({{ doc.ratingCount }})
                    </dd>
                  </div>
                }
              </dl>
              <p class="mt-4 border-t border-slate-100 pt-3 text-xs leading-relaxed text-slate-400">
                Mỗi người được tính một lượt xem cho mỗi tài liệu trong một ngày.
              </p>
            </section>
          </aside>
        </div>
      </article>
    }
  `,
})
export class DocumentDetailPage implements OnInit {
  private readonly documentsApi = inject(DocumentService);
  private readonly route = inject(ActivatedRoute);
  private readonly title = inject(Title);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly currentUser = inject(AuthService).currentUser;
  protected readonly item = signal<DocumentDetail | null>(null);
  protected readonly loading = signal(true);
  protected readonly errors = signal<string[]>([]);
  private readonly documentId = signal<string | null>(null);

  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      this.documentId.set(params.get('id'));
      this.load();
    });
  }

  protected retry(): void {
    this.load();
  }

  /** Các loại file có trong tài liệu, không trùng nhau (PDF, DOCX, PPTX…). */
  protected fileTypes(files: DocumentFile[]): string[] {
    return [...new Set(files.map((file) => fileExtension(file.name)))];
  }

  protected fileType(file: DocumentFile): string {
    return fileExtension(file.name);
  }

  protected fileSize(bytes: number): string {
    return formatFileSize(bytes);
  }

  protected authorInitials(fullName: string): string {
    return initials(fullName);
  }

  protected statusLabel(status: DocumentStatus): string {
    return STATUS_LABEL[status];
  }

  protected ratingLabel(value: number): string {
    return value.toFixed(1);
  }

  private load(): void {
    const id = this.documentId();
    if (!id) {
      this.loading.set(false);
      this.errors.set(['Đường dẫn tài liệu không hợp lệ.']);
      return;
    }

    this.loading.set(true);
    this.errors.set([]);

    this.documentsApi
      .findById(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (document) => {
          this.item.set(document);
          this.loading.set(false);
          this.title.setTitle(`${document.title} · Learning Hub`);
        },
        error: (error: unknown) => {
          this.item.set(null);
          this.errors.set(getApiErrorMessages(error));
          this.loading.set(false);
        },
      });
  }
}
