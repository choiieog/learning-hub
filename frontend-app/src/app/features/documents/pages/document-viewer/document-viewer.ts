import { HttpClient } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DomSanitizer, SafeResourceUrl, Title } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { renderAsync } from 'docx-preview';
import { Subscription } from 'rxjs';
import { fileExtension } from '../../../../core/utils/format.util';

type ViewerKind = 'pdf' | 'docx' | 'other';

/**
 * Trang đọc nội dung một tệp đính kèm trong tab riêng.
 *
 * Nhận `?src=` (đường dẫn tệp do backend trả) và `?name=` từ danh sách tệp đính kèm:
 * - PDF: nhúng `<iframe>` để dùng trình đọc PDF của trình duyệt;
 * - DOCX: tải tệp rồi dựng bằng `docx-preview` (thuần client, không cần dịch vụ ngoài);
 * - PPTX: trình duyệt không dựng trung thực được → chỉ còn lối tải về.
 *
 * Chỉ chấp nhận đường dẫn cùng origin bắt đầu bằng `/api/files/`, nên query param không
 * thể dùng để nhúng nội dung từ website khác.
 */
@Component({
  selector: 'app-document-viewer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <article class="space-y-5">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div class="min-w-0">
          <a
            routerLink="/documents"
            class="text-sm font-medium text-slate-500 transition hover:text-indigo-600"
          >
            ← Về danh sách
          </a>
          <h1 class="mt-2 truncate text-2xl font-semibold tracking-tight text-slate-900">
            {{ fileName() || 'Xem tệp' }}
          </h1>
        </div>

        @if (src(); as source) {
          <a
            [href]="source"
            [attr.download]="fileName()"
            target="_blank"
            rel="noopener noreferrer"
            class="btn-secondary w-auto"
          >
            Tải xuống
          </a>
        }
      </div>

      @if (invalid()) {
        <div class="alert alert-error" role="alert">
          <p>Đường dẫn tệp không hợp lệ hoặc tệp không còn tồn tại.</p>
        </div>
      } @else if (kind() === 'pdf' && pdfUrl(); as url) {
        <iframe
          [src]="url"
          [title]="fileName()"
          class="h-[80vh] w-full rounded-xl border border-slate-200 bg-slate-50"
        ></iframe>
      } @else if (kind() === 'docx') {
        @if (loading()) {
          <p
            class="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500"
            aria-busy="true"
          >
            Đang dựng bản xem trước…
          </p>
        }

        @if (error(); as message) {
          <div class="alert alert-error" role="alert">
            <p>{{ message }}</p>
          </div>
        }

        <div
          #docxHost
          class="max-h-[80vh] overflow-auto rounded-xl border border-slate-200 bg-white px-4 py-3"
          [class.hidden]="loading() || !!error()"
        ></div>
      } @else {
        <div class="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p class="text-sm font-medium text-slate-700">
            Chưa đọc trực tiếp được {{ fileType() }}
          </p>
          <p class="mt-1 text-sm text-slate-500">
            Định dạng này cần Word/PowerPoint nên hãy tải về để xem nội dung.
          </p>
        </div>
      }
    </article>
  `,
})
export class DocumentViewerPage {
  private readonly http = inject(HttpClient);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly route = inject(ActivatedRoute);
  private readonly title = inject(Title);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly src = signal<string | null>(null);
  protected readonly fileName = signal('');
  protected readonly kind = signal<ViewerKind>('other');
  protected readonly pdfUrl = signal<SafeResourceUrl | null>(null);
  protected readonly invalid = signal(false);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly fileType = computed(() => fileExtension(this.fileName()) || 'định dạng này');

  private readonly docxHost = viewChild<ElementRef<HTMLElement>>('docxHost');
  /** Buffer đã tải xong nhưng container chưa có trong DOM; dựng ngay khi nó xuất hiện. */
  private readonly pendingDocx = signal<ArrayBuffer | null>(null);
  private docxRequest?: Subscription;
  /** Container của bản dựng đang được phép cập nhật trạng thái; `null` khi đã bị thay thế. */
  private activeDocx: HTMLElement | null = null;

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      this.open(params.get('src'), params.get('name') ?? '');
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

  /** Đọc query param, chỉ giữ đường dẫn tệp cùng origin và quyết định cách hiển thị. */
  private open(raw: string | null, name: string): void {
    const url = internalFilePath(raw);
    const label = name || url?.split('/').pop() || '';
    const extension = fileExtension(label || url || '');
    const kind: ViewerKind =
      extension === 'PDF' ? 'pdf' : extension === 'DOCX' ? 'docx' : 'other';

    this.stopDocx();
    this.error.set(null);
    this.loading.set(false);
    this.src.set(url);
    this.fileName.set(label);
    this.kind.set(kind);
    this.invalid.set(url === null);
    this.pdfUrl.set(
      url && kind === 'pdf' ? this.sanitizer.bypassSecurityTrustResourceUrl(url) : null,
    );
    this.title.setTitle(`${label || 'Xem tệp'} · Learning Hub`);

    if (url && kind === 'docx') {
      this.loadDocx(url);
    }
  }

  /** Huỷ việc tải/dựng đang chạy và quên bản dựng hiện tại. */
  private stopDocx(): void {
    this.docxRequest?.unsubscribe();
    this.docxRequest = undefined;
    this.activeDocx = null;
    this.pendingDocx.set(null);
  }

  /** Tải tệp rồi đưa buffer sang hiệu ứng dựng khi container đã tồn tại. */
  private loadDocx(url: string): void {
    this.loading.set(true);

    this.docxRequest = this.http
      .get(url, { responseType: 'arraybuffer' })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        // Request của tệp trước đã bị huỷ nên ở đây luôn là tệp đang mở.
        next: (buffer) => this.pendingDocx.set(buffer as ArrayBuffer),
        error: () => {
          this.error.set('Không tải được tệp để xem trước.');
          this.loading.set(false);
        },
      });
  }

  /**
   * Mỗi bản dựng vẽ vào container riêng của nó. Khi người dùng mở tệp khác, container cũ bị
   * gỡ khỏi DOM nên bản dựng chậm của tệp trước chỉ còn ghi vào node đã rời DOM — không thể
   * ghi đè nội dung tệp mới; nó cũng không được đổi trạng thái vì không còn là bản đang dựng.
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

        this.loading.set(false);
      })
      .catch(() => {
        container.remove();

        if (container !== this.activeDocx) {
          return;
        }

        this.activeDocx = null;
        this.error.set('Không dựng được bản xem trước tệp này.');
        this.loading.set(false);
      });
  }
}

/** Chỉ nhận đường dẫn tệp do backend trả (`/api/files/...`) trên chính origin hiện tại. */
function internalFilePath(raw: string | null): string | null {
  if (!raw || !raw.startsWith('/api/files/')) {
    return null;
  }

  try {
    const url = new URL(raw, window.location.origin);
    return url.origin === window.location.origin ? url.pathname + url.search : null;
  } catch {
    return null;
  }
}
