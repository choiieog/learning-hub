import { HttpClient } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription } from 'rxjs';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { renderAsync } from 'docx-preview';
import { DocumentFile } from '../../../../core/models';
import { fileExtension } from '../../../../core/utils/format.util';

type PreviewKind = 'pdf' | 'docx' | 'other';

/**
 * Xem tài liệu ngay trên web, không cần tải về.
 *
 * - PDF: nhúng thẳng vào `<iframe>` để dùng trình đọc PDF của trình duyệt.
 * - DOCX: tải file rồi dựng bằng `docx-preview` (thuần client, không cần dịch vụ ngoài).
 * - PPTX: chưa có cách dựng trung thực trong trình duyệt → hiện lối mở file ở tab mới.
 *
 * Dùng chung cho trang chi tiết tài liệu (sinh viên) và trang duyệt bài (admin), nên
 * admin xem được đúng bản mà sinh viên sẽ thấy trước khi bấm duyệt/từ chối.
 */
@Component({
  selector: 'app-document-preview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (file(); as current) {
      @if (kind() === 'pdf' && pdfUrl(); as url) {
        <iframe
          [src]="url"
          [title]="'Xem trước ' + current.name"
          class="h-[460px] w-full rounded-lg border border-slate-200 bg-slate-50"
        ></iframe>
        <p class="mt-2 text-xs text-slate-400">
          PDF hiển thị trực tiếp. Nếu khung trống, trình duyệt không có trình đọc PDF —
          <a
            [href]="current.url"
            target="_blank"
            rel="noopener noreferrer"
            class="text-indigo-600"
            >mở file ở tab mới</a
          >.
        </p>
      } @else if (kind() === 'docx') {
        @if (docxLoading()) {
          <p
            class="rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-slate-500"
            aria-busy="true"
          >
            Đang dựng bản xem trước…
          </p>
        }

        @if (docxError(); as message) {
          <div class="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
            <p class="text-sm font-medium text-slate-700">{{ message }}</p>
            <a
              [href]="current.url"
              target="_blank"
              rel="noopener noreferrer"
              class="btn-secondary mt-3 w-auto"
            >
              Mở file ở tab mới
            </a>
          </div>
        }

        <div
          #docxHost
          class="max-h-[460px] overflow-auto rounded-lg border border-slate-200 bg-white px-4 py-3"
          [class.hidden]="docxLoading() || !!docxError()"
        ></div>
      } @else {
        <div class="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
          <p class="text-sm font-medium text-slate-700">
            Chưa xem trước được {{ fileTypeName(current) }}
          </p>
          <p class="mt-1 text-xs text-slate-500">
            Định dạng này cần mở bằng Word/PowerPoint nên phải tải về hoặc mở ở tab mới.
          </p>
          <a
            [href]="current.url"
            target="_blank"
            rel="noopener noreferrer"
            class="btn-secondary mt-4 w-auto"
          >
            Mở file ở tab mới
          </a>
        </div>
      }
    }
  `,
})
export class DocumentPreview {
  private readonly http = inject(HttpClient);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly destroyRef = inject(DestroyRef);

  /** File đang chọn; `null` thì không hiển thị gì. */
  readonly file = input<DocumentFile | null>(null);

  protected readonly docxLoading = signal(false);
  protected readonly docxError = signal<string | null>(null);

  private readonly docxHost = viewChild<ElementRef<HTMLElement>>('docxHost');
  /** Buffer đã tải xong nhưng container chưa có trong DOM; dựng ngay khi nó xuất hiện. */
  private readonly pendingDocx = signal<ArrayBuffer | null>(null);
  private docxRequest?: Subscription;
  /** Container của bản dựng đang được phép cập nhật trạng thái; `null` khi đã bị thay thế. */
  private activeDocx: HTMLElement | null = null;

  protected readonly kind = computed<PreviewKind>(() => {
    const extension = fileExtension(this.file()?.name ?? '');

    if (extension === 'PDF') {
      return 'pdf';
    }

    return extension === 'DOCX' ? 'docx' : 'other';
  });

  protected readonly pdfUrl = computed<SafeResourceUrl | null>(() => {
    const current = this.file();

    return current && this.kind() === 'pdf'
      ? this.sanitizer.bypassSecurityTrustResourceUrl(current.url)
      : null;
  });

  constructor() {
    effect(() => {
      const current = this.file();

      if (current && this.kind() === 'docx') {
        this.loadDocx(current);
        return;
      }

      this.stopDocx();
      this.docxLoading.set(false);
    });

    // Không hẹn giờ: hiệu ứng chạy lại đúng khi view đã tạo xong container (viewChild là signal).
    effect(() => {
      const host = this.docxHost()?.nativeElement;
      const buffer = this.pendingDocx();

      if (!host || !buffer) {
        return;
      }

      this.pendingDocx.set(null);
      this.drawDocx(host, buffer);
    });
  }

  protected fileTypeName(file: DocumentFile): string {
    return fileExtension(file.name) || 'định dạng này';
  }

  /** Huỷ việc tải/dựng đang chạy và quên bản dựng hiện tại. */
  private stopDocx(): void {
    this.docxRequest?.unsubscribe();
    this.docxRequest = undefined;
    this.activeDocx = null;
    this.pendingDocx.set(null);
    this.docxError.set(null);
  }

  /** Tải file rồi đưa buffer sang hiệu ứng dựng khi container đã tồn tại. */
  private loadDocx(file: DocumentFile): void {
    this.stopDocx();
    this.docxLoading.set(true);

    this.docxRequest = this.http
      .get(file.url, { responseType: 'arraybuffer' })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        // Request của file trước đã bị huỷ nên ở đây luôn là file đang chọn.
        next: (buffer) => this.pendingDocx.set(buffer as ArrayBuffer),
        error: () => {
          this.docxError.set('Không tải được file để xem trước.');
          this.docxLoading.set(false);
        },
      });
  }

  /**
   * Mỗi bản dựng vẽ vào container riêng của nó. Khi người dùng chuyển file, container cũ bị
   * gỡ khỏi DOM nên bản dựng chậm của file trước chỉ còn ghi vào node đã rời DOM — không thể
   * ghi đè nội dung file mới; nó cũng không được đổi trạng thái vì không còn là bản đang dựng.
   */
  private drawDocx(host: HTMLElement, buffer: ArrayBuffer): void {
    host.replaceChildren();

    const container = document.createElement('div');
    host.appendChild(container);
    this.activeDocx = container;

    void renderAsync(buffer, container)
      .then(() => {
        if (container !== this.activeDocx) {
          container.remove();
          return;
        }

        this.docxLoading.set(false);
      })
      .catch(() => {
        container.remove();

        if (container !== this.activeDocx) {
          return;
        }

        this.activeDocx = null;
        this.docxError.set('Không dựng được bản xem trước file này.');
        this.docxLoading.set(false);
      });
  }
}
