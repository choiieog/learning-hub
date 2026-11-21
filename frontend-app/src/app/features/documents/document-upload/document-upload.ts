import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { Observable, TimeoutError, catchError, throwError, timeout } from 'rxjs';
import { Subject, StoredFile } from '../../../core/models';
import { DocumentService } from '../../../core/services/document.service';
import { SubjectService } from '../../../core/services/subject.service';
import { UploadService } from '../../../core/services/upload.service';
import { getApiErrorMessages } from '../../../core/utils/api-error.util';
import { fileExtension, formatFileSize } from '../../../core/utils/format.util';

const MAX_FILES = 3;
const MAX_FILE_MB = 20;
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;
const ALLOWED_EXTENSIONS = ['pdf', 'docx', 'pptx'];
const MIN_TITLE_LENGTH = 5;
/** Mỗi file tối đa 20MB nên 2 phút là quá đủ; treo lâu hơn coi như mất kết nối. */
const UPLOAD_TIMEOUT_MS = 120_000;
const CREATE_TIMEOUT_MS = 30_000;
const UPLOAD_ATTEMPTS = 2;

/**
 * Đăng tài liệu: chọn môn, tải file thật lên (qua POST /api/uploads) rồi tạo
 * tài liệu ở trạng thái PENDING. Chỉ sau khi admin duyệt, tài liệu mới xuất hiện
 * trong danh sách công khai.
 */
@Component({
  selector: 'app-document-upload',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './document-upload.html',
  styleUrl: './document-upload.css',
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
  /** File đã upload xong — giữ lại để lần gửi sau chỉ tải các file còn thiếu. */
  private readonly uploaded = signal<{ file: File; stored: StoredFile }[]>([]);
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
    const [removed] = this.files().slice(index, index + 1);

    this.files.set(this.files().filter((_, position) => position !== index));
    // Bỏ file thì bỏ luôn kết quả upload của nó, tránh dùng lại file không còn trong form.
    this.uploaded.update((entries) => entries.filter((entry) => entry.file !== removed));
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
    this.uploadAll(title, subjectId, this.description().trim());
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
        problems.push(
          `"${file.name}" nặng ${formatFileSize(file.size)} — vượt quá ${MAX_FILE_MB}MB.`,
        );
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

  /**
   * Upload tuần tự, dừng ngay khi một file lỗi.
   * File đã tải xong được giữ trong `uploaded`, nên bấm gửi lại chỉ tải phần còn thiếu
   * (trước đây lỗi ở file thứ 3 làm 2 file đầu thành file mồ côi và phải tải lại cả 3).
   */
  private uploadAll(title: string, subjectId: string, description: string): void {
    const missing = this.files().filter((file) => !this.storedFor(file));

    if (missing.length === 0) {
      this.createDocument(
        title,
        description,
        subjectId,
        this.files().map((file) => this.storedFor(file) as StoredFile),
      );
      return;
    }

    const next = missing[0];
    this.progress.set(
      `Đang tải ${next.name} (${this.uploaded().length + 1}/${this.files().length})…`,
    );

    this.uploadFile(next)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (stored) => {
          this.uploaded.update((entries) => [...entries, { file: next, stored }]);
          this.uploadAll(title, subjectId, description);
        },
        error: (error: unknown) => {
          const done = this.uploaded().length;
          this.errors.set([
            ...uploadFailureMessage(error, next.name, UPLOAD_TIMEOUT_MS),
            done > 0
              ? `Đã tải xong ${done}/${this.files().length} file. Bấm "Gửi để duyệt" để chỉ tải tiếp các file còn lại.`
              : `Tệp đã chọn vẫn được giữ — bấm "Gửi để duyệt" để thử lại, không cần chọn lại tệp.`,
          ]);
          this.finish();
        },
      });
  }

  /**
   * Một file: timeout + tự thử lại 1 lần khi mất kết nối (status 0) hoặc server không trả lời.
   * Trước đây request treo làm form kẹt ở "Đang gửi…" cho tới khi F5, hoặc mất kết nối một
   * nhịp là phải bấm lại từ đầu.
   */
  private uploadFile(file: File, attempt = 1): Observable<StoredFile> {
    return this.uploadsApi.upload(file, 'documents').pipe(
      timeout({ first: UPLOAD_TIMEOUT_MS }),
      catchError((error: unknown) => {
        const retryable =
          error instanceof TimeoutError ||
          (error instanceof HttpErrorResponse && error.status === 0);

        if (retryable && attempt < UPLOAD_ATTEMPTS) {
          this.progress.set(
            `Mất kết nối khi tải ${file.name} — đang thử lại (${attempt + 1}/${UPLOAD_ATTEMPTS})…`,
          );

          return this.uploadFile(file, attempt + 1);
        }

        return throwError(() => error);
      }),
    );
  }

  /** Kết quả upload của một file đã có trong `uploaded` (khớp theo tên + dung lượng). */
  private storedFor(file: File): StoredFile | undefined {
    return this.uploaded().find(
      (entry) => entry.file.name === file.name && entry.file.size === file.size,
    )?.stored;
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
      .pipe(timeout({ first: CREATE_TIMEOUT_MS }), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (document) => {
          // Dọn form trước khi rời trang: bấm lại "Đăng tài liệu" không tạo bài trùng.
          this.uploaded.set([]);
          this.files.set([]);
          this.title.set('');
          this.description.set('');
          this.selectedSubjectId.set('');
          this.finish();
          // Chủ bài xem được tài liệu PENDING của mình ở trang chi tiết.
          void this.router.navigate(['/documents', document.id]);
        },
        error: (error: unknown) => {
          const keepFiles =
            'Các tệp đã tải lên vẫn được giữ — bấm "Gửi để duyệt" để thử lại mà không phải chọn lại tệp.';

          this.errors.set(
            error instanceof TimeoutError ||
              (error instanceof HttpErrorResponse && error.status === 0)
              ? [`Không tạo được tài liệu vì kết nối bị ngắt. ${keepFiles}`]
              : getApiErrorMessages(error),
          );
          this.finish();
        },
      });
  }

  private finish(): void {
    this.submitting.set(false);
    this.progress.set(null);
  }
}

/**
 * Lỗi tải một tệp, nói rõ tệp nào và bước nào — không dùng câu "kiểm tra mạng" chung
 * vì người dùng cần biết tệp đã lên máy chủ hay chưa và form còn giữ lựa chọn hay không.
 */
function uploadFailureMessage(error: unknown, fileName: string, timeoutMs: number): string[] {
  if (error instanceof TimeoutError) {
    return [
      `Tải "${fileName}" quá lâu (${timeoutMs / 1000}s) — máy chủ không phản hồi. Tệp này chưa được tải lên.`,
    ];
  }

  if (error instanceof HttpErrorResponse && error.status === 0) {
    return [`Mất kết nối khi tải "${fileName}" — tệp này chưa được tải lên máy chủ.`];
  }

  return getApiErrorMessages(error);
}
