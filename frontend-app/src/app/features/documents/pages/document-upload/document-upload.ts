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
import { Router, RouterLink } from '@angular/router';
import { Subject, StoredFile } from '../../../../core/models';
import { DocumentService } from '../../../../core/services/document.service';
import { SubjectService } from '../../../../core/services/subject.service';
import { UploadService } from '../../../../core/services/upload.service';
import { getApiErrorMessages } from '../../../../core/utils/api-error.util';
import { fileExtension, formatFileSize } from '../../../../core/utils/format.util';

const MAX_FILES = 3;
const MAX_FILE_MB = 20;
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;
const ALLOWED_EXTENSIONS = ['pdf', 'docx', 'pptx'];
const MIN_TITLE_LENGTH = 5;

/**
 * Đăng tài liệu: chọn môn, tải file thật lên (qua POST /api/uploads) rồi tạo
 * tài liệu ở trạng thái PENDING. Chỉ sau khi admin duyệt, tài liệu mới xuất hiện
 * trong danh sách công khai.
 */
@Component({
  selector: 'app-document-upload',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Đăng tài liệu</h1>
        <p class="mt-1 text-sm text-slate-500">
          Tài liệu sẽ được admin duyệt trước khi hiển thị với mọi người.
        </p>
      </div>
      <a routerLink="/documents" class="text-sm font-medium text-slate-500 hover:text-indigo-600">
        ← Về danh sách
      </a>
    </div>

    @if (errors().length > 0) {
      <div class="alert alert-error mt-5" role="alert">
        @for (error of errors(); track error) {
          <p>{{ error }}</p>
        }
      </div>
    }

    <form class="mt-6 grid gap-6 lg:grid-cols-3" (submit)="submit($event)">
      <div class="space-y-6 lg:col-span-2">
        <section class="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
          <div>
            <label class="mb-1.5 block text-sm font-medium text-slate-700" for="title">
              Tiêu đề <span class="text-rose-500">*</span>
            </label>
            <input
              id="title"
              type="text"
              class="field-input"
              maxlength="200"
              placeholder="Ví dụ: Đề cương ôn tập Giải tích 1"
              [value]="title()"
              (input)="title.set(readValue($event))"
            />
            <p class="mt-1 text-xs text-slate-400">
              {{ title().trim().length }}/200 ký tự — cần ít nhất {{ minTitleLength }} ký tự.
            </p>
          </div>

          <div class="mt-4">
            <label class="mb-1.5 block text-sm font-medium text-slate-700" for="subject">
              Môn học <span class="text-rose-500">*</span>
            </label>
            <select id="subject" class="field-input" (change)="selectedSubjectId.set(readValue($event))">
              <option value="" [selected]="selectedSubjectId() === ''">— Chọn môn học —</option>
              @for (subject of subjects(); track subject.id) {
                <option
                  [value]="subject.id"
                  [selected]="subject.id === selectedSubjectId()"
                  [attr.data-code]="subject.code"
                >
                  {{ subject.code }} · {{ subject.name }}
                </option>
              }
            </select>
            @if (subjectsError()) {
              <p class="mt-1 text-xs text-rose-600">{{ subjectsError() }}</p>
            }
          </div>

          <div class="mt-4">
            <label class="mb-1.5 block text-sm font-medium text-slate-700" for="description">
              Mô tả
            </label>
            <textarea
              id="description"
              rows="3"
              class="field-input resize-y"
              maxlength="1000"
              placeholder="Tài liệu này gồm những gì? Sinh viên nên dùng khi nào?"
              [value]="description()"
              (input)="description.set(readValue($event))"
            ></textarea>
            <p class="mt-1 text-xs text-slate-400">{{ description().length }}/1000 ký tự</p>
          </div>
        </section>

        <section class="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
          <div class="flex items-center justify-between gap-3">
            <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500">
              File đính kèm <span class="text-rose-500">*</span>
            </h2>
            <span class="text-xs text-slate-400">{{ files().length }}/{{ maxFiles }} file</span>
          </div>

          <label
            for="document-files"
            class="mt-3 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-8 text-center transition"
            [class]="
              dragActive()
                ? 'border-indigo-400 bg-indigo-50'
                : 'border-slate-300 bg-slate-50 hover:border-indigo-300 hover:bg-indigo-50/40'
            "
            (dragover)="onDragOver($event)"
            (dragleave)="dragActive.set(false)"
            (drop)="onDrop($event)"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" class="h-8 w-8 text-slate-400" aria-hidden="true">
              <path
                d="M12 3a.75.75 0 0 1 .53.22l3.5 3.5a.75.75 0 0 1-1.06 1.06L12.75 5.56v9.69a.75.75 0 0 1-1.5 0V5.56L9.03 7.78a.75.75 0 0 1-1.06-1.06l3.5-3.5A.75.75 0 0 1 12 3Z"
              />
              <path
                d="M5 14.25a.75.75 0 0 1 .75.75v3.5c0 .414.336.75.75.75h11a.75.75 0 0 0 .75-.75V15a.75.75 0 0 1 1.5 0v3.5A2.25 2.25 0 0 1 17.5 20.75h-11A2.25 2.25 0 0 1 4.25 18.5V15a.75.75 0 0 1 .75-.75Z"
              />
            </svg>
            <span class="mt-2 text-sm font-medium text-slate-700">
              Kéo thả file vào đây hoặc bấm để chọn
            </span>
            <span class="mt-1 text-xs text-slate-500">
              PDF, DOCX, PPTX · tối đa {{ maxFiles }} file · mỗi file ≤ {{ maxFileMb }}MB
            </span>
          </label>
          <input
            id="document-files"
            type="file"
            class="sr-only"
            multiple
            accept=".pdf,.docx,.pptx"
            (change)="onFilesSelected($event)"
          />

          @if (files().length > 0) {
            <ul class="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200">
              @for (file of files(); track $index) {
                <li class="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div class="flex min-w-0 items-center gap-3">
                    <span
                      class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-100 text-[10px] font-bold text-slate-500"
                    >
                      {{ badge(file) }}
                    </span>
                    <div class="min-w-0">
                      <p class="truncate text-sm font-medium text-slate-800">{{ file.name }}</p>
                      <p class="text-xs text-slate-500">
                        {{ size(file) }} · <span class="text-emerald-600">đã chọn</span>
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    class="rounded-md px-2 py-1 text-xs font-medium text-rose-600 transition hover:bg-rose-50"
                    [attr.aria-label]="'Bỏ chọn ' + file.name"
                    (click)="removeFile($index)"
                  >
                    Bỏ chọn
                  </button>
                </li>
              }
            </ul>
          } @else {
            <p class="mt-3 text-xs text-slate-400">Chưa chọn file nào.</p>
          }
        </section>

        <div class="flex flex-wrap items-center gap-3">
          <button type="submit" class="btn-primary w-auto" [disabled]="!canSubmit()">
            @if (submitting()) {
              Đang gửi…
            } @else {
              Gửi để duyệt
            }
          </button>
          <a routerLink="/documents" class="btn-secondary">Huỷ</a>
          @if (progress()) {
            <span class="text-sm text-slate-500">{{ progress() }}</span>
          }
        </div>
      </div>

      <aside class="space-y-4">
        <section class="rounded-xl border border-indigo-100 bg-indigo-50/60 p-5">
          <h2 class="text-sm font-semibold text-indigo-900">Trước khi gửi</h2>
          <ul class="mt-3 space-y-2 text-sm leading-relaxed text-indigo-900/80">
            <li>• Mỗi tài liệu thuộc đúng một môn học.</li>
            <li>• Tối đa {{ maxFiles }} file, mỗi file không quá {{ maxFileMb }}MB.</li>
            <li>• Chỉ nhận PDF, DOCX, PPTX.</li>
            <li>• Tài liệu vào trạng thái <strong>chờ duyệt</strong>; chỉ bạn và admin thấy cho tới khi được duyệt.</li>
          </ul>
        </section>

        <section class="rounded-xl border border-slate-200 bg-white p-5">
          <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500">Quy trình</h2>
          <ol class="mt-3 space-y-2 text-sm text-slate-600">
            <li>1. Điền thông tin và chọn file.</li>
            <li>2. Gửi — file được tải lên máy chủ.</li>
            <li>3. Admin duyệt trong trang quản trị.</li>
            <li>4. Tài liệu xuất hiện trong danh sách công khai.</li>
          </ol>
        </section>
      </aside>
    </form>
  `,
})
export class DocumentUpload implements OnInit {
  private readonly uploadsApi = inject(UploadService);
  private readonly documentsApi = inject(DocumentService);
  private readonly subjectsApi = inject(SubjectService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly maxFiles = MAX_FILES;
  protected readonly maxFileMb = MAX_FILE_MB;
  protected readonly minTitleLength = MIN_TITLE_LENGTH;

  protected readonly subjects = signal<Subject[]>([]);
  protected readonly subjectsError = signal('');
  protected readonly title = signal('');
  protected readonly description = signal('');
  protected readonly selectedSubjectId = signal('');
  protected readonly files = signal<File[]>([]);
  protected readonly errors = signal<string[]>([]);
  protected readonly progress = signal<string | null>(null);
  protected readonly submitting = signal(false);
  protected readonly dragActive = signal(false);

  protected readonly canSubmit = computed(
    () =>
      !this.submitting() &&
      this.title().trim().length >= MIN_TITLE_LENGTH &&
      this.selectedSubjectId() !== '' &&
      this.files().length > 0,
  );

  ngOnInit(): void {
    this.subjectsApi
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (subjects) => this.subjects.set(subjects),
        error: (error: unknown) => this.subjectsError.set(getApiErrorMessages(error)[0] ?? ''),
      });
  }

  protected readValue(event: Event): string {
    return (event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value;
  }

  protected onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.addFiles(Array.from(input.files ?? []));
    // Cho phép chọn lại đúng file vừa bỏ chọn.
    input.value = '';
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragActive.set(true);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragActive.set(false);
    this.addFiles(Array.from(event.dataTransfer?.files ?? []));
  }

  protected removeFile(index: number): void {
    this.files.set(this.files().filter((_, position) => position !== index));
    this.errors.set([]);
  }

  protected badge(file: File): string {
    return fileExtension(file.name);
  }

  protected size(file: File): string {
    return formatFileSize(file.size);
  }

  protected submit(event: Event): void {
    event.preventDefault();
    this.errors.set([]);

    const title = this.title().trim();
    const subjectId = this.selectedSubjectId();

    if (title.length < MIN_TITLE_LENGTH) {
      this.errors.set([`Tiêu đề cần ít nhất ${MIN_TITLE_LENGTH} ký tự.`]);
      return;
    }

    if (!subjectId) {
      this.errors.set(['Chọn môn học cho tài liệu.']);
      return;
    }

    if (this.files().length === 0) {
      this.errors.set(['Chọn ít nhất một file PDF, DOCX hoặc PPTX.']);
      return;
    }

    this.submitting.set(true);
    this.uploadAll([...this.files()], [], title, subjectId, this.description().trim());
  }

  /** Thêm file có kiểm tra định dạng, dung lượng và số lượng — báo lỗi ngay tại chỗ. */
  private addFiles(incoming: File[]): void {
    const problems: string[] = [];
    const selected = [...this.files()];

    for (const file of incoming) {
      const extension = file.name.split('.').pop()?.toLowerCase() ?? '';

      if (!ALLOWED_EXTENSIONS.includes(extension)) {
        problems.push(`"${file.name}": chỉ nhận file PDF, DOCX, PPTX.`);
        continue;
      }

      if (file.size > MAX_FILE_BYTES) {
        problems.push(`"${file.name}" nặng ${formatFileSize(file.size)} — vượt quá ${MAX_FILE_MB}MB.`);
        continue;
      }

      if (file.size === 0) {
        problems.push(`"${file.name}" là file rỗng.`);
        continue;
      }

      if (selected.some((item) => item.name === file.name && item.size === file.size)) {
        continue;
      }

      if (selected.length >= MAX_FILES) {
        problems.push(`Chỉ được chọn tối đa ${MAX_FILES} file.`);
        break;
      }

      selected.push(file);
    }

    this.files.set(selected);
    this.errors.set(problems);
  }

  /** Upload tuần tự để báo đúng file đang tải và dừng ngay khi một file lỗi. */
  private uploadAll(
    pending: File[],
    uploaded: StoredFile[],
    title: string,
    subjectId: string,
    description: string,
  ): void {
    if (pending.length === 0) {
      this.createDocument(title, description, subjectId, uploaded);
      return;
    }

    const [next, ...rest] = pending;
    this.progress.set(`Đang tải ${next.name} (${uploaded.length + 1}/${this.files().length})…`);

    this.uploadsApi
      .upload(next, 'documents')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (stored) => this.uploadAll(rest, [...uploaded, stored], title, subjectId, description),
        error: (error: unknown) => {
          this.errors.set(getApiErrorMessages(error));
          this.finish();
        },
      });
  }

  private createDocument(
    title: string,
    description: string,
    subjectId: string,
    files: StoredFile[],
  ): void {
    this.progress.set('Đang tạo tài liệu…');

    this.documentsApi
      .create({ title, description: description || undefined, subjectId, files })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (document) => {
          this.finish();
          // Chủ bài xem được tài liệu PENDING của mình ở trang chi tiết.
          void this.router.navigate(['/documents', document.id]);
        },
        error: (error: unknown) => {
          this.errors.set(getApiErrorMessages(error));
          this.finish();
        },
      });
  }

  private finish(): void {
    this.submitting.set(false);
    this.progress.set(null);
  }
}
