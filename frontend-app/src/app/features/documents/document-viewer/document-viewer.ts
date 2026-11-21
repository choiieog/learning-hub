import { HttpClient, HttpErrorResponse } from '@angular/common/http';
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
import { AuthService } from '../../../core/services/auth.service';
import { fileExtension } from '../../../core/utils/format.util';

type ViewerKind = 'pdf' | 'docx' | 'other';

/**
 * Trang đọc nội dung một tệp đính kèm trong tab riêng.
 *
 * Nhận `?src=` (đường dẫn tệp do backend trả) và `?name=` từ danh sách tệp đính kèm:
 * - PDF: tải tệp qua HTTP (kèm access token) rồi nhúng `<iframe>` từ blob;
 * - DOCX: cũng tải qua HTTP rồi dựng bằng `docx-preview` (thuần client);
 * - PPTX: trình duyệt không dựng trung thực được → chỉ còn lối tải về.
 *
 * Tải qua HTTP thay vì trỏ `<iframe>`/`<a>` thẳng vào URL để request có access token
 * (endpoint `/api/files` chặn tệp của bài chưa duyệt) và để báo được lỗi 401/403/404
 * ngay trên trang thay vì hiện JSON thô của API.
 *
 * Chỉ chấp nhận đường dẫn cùng origin bắt đầu bằng `/api/files/`, nên query param không
 * thể dùng để nhúng nội dung từ website khác.
 */
@Component({
  selector: 'app-document-viewer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './document-viewer.html',
  styleUrl: './document-viewer.css',
})
export class DocumentViewerPage {
  private readonly http = inject(HttpClient);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly route = inject(ActivatedRoute);
  private readonly title = inject(Title);
  private readonly destroyRef = inject(DestroyRef);
  private readonly auth = inject(AuthService);

  protected readonly isAdmin = this.auth.isAdmin;
  protected readonly fileName = signal('');
  protected readonly kind = signal<ViewerKind>('other');
  protected readonly invalid = signal(false);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly pdfUrl = signal<SafeResourceUrl | null>(null);
  protected readonly downloadUrl = signal<string | null>(null);
  protected readonly fileType = computed(() => fileExtension(this.fileName()) || 'định dạng này');

  private readonly docxHost = viewChild<ElementRef<HTMLElement>>('docxHost');
  /** Buffer đã tải xong nhưng container chưa có trong DOM; dựng ngay khi nó xuất hiện. */
  private readonly pendingDocx = signal<ArrayBuffer | null>(null);
  /** Blob URL đang dùng — phải revoke khi mở tệp khác/rời trang để không rò rỉ bộ nhớ. */
  private objectUrl: string | null = null;
  private fileRequest?: Subscription;
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

    this.destroyRef.onDestroy(() => {
      this.fileRequest?.unsubscribe();
      this.releaseObjectUrl();
    });
  }

  /** Đọc query param, chỉ giữ đường dẫn tệp cùng origin và quyết định cách hiển thị. */
  private open(raw: string | null, name: string): void {
    this.fileRequest?.unsubscribe();
    this.releaseObjectUrl();

    const url = internalFilePath(raw);
    const label = name || url?.split('/').pop() || '';
    const extension = fileExtension(label || url || '');
    const kind: ViewerKind =
      extension === 'PDF' ? 'pdf' : extension === 'DOCX' ? 'docx' : 'other';

    this.activeDocx = null;
    this.pendingDocx.set(null);
    this.error.set(null);
    this.pdfUrl.set(null);
    this.downloadUrl.set(null);
    this.fileName.set(label);
    this.kind.set(kind);
    this.invalid.set(url === null);
    this.title.setTitle(`${label || 'Xem tệp'} · Learning Hub`);

    if (!url) {
      this.loading.set(false);
      return;
    }

    this.fetchFile(url, kind);
  }

  /**
   * Tải tệp một lần rồi tuỳ định dạng: nhúng PDF, dựng DOCX, hoặc giữ blob cho nút tải.
   * Lỗi 401/403/404 được đổi thành câu giải thích thay vì JSON của API.
   */
  private fetchFile(url: string, kind: ViewerKind): void {
    this.loading.set(true);

    this.fileRequest = this.http
      .get(url, { responseType: 'arraybuffer' })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (buffer) => {
          const typed = buffer as ArrayBuffer;

          if (kind === 'docx') {
            this.pendingDocx.set(typed);
          } else {
            this.objectUrl = URL.createObjectURL(new Blob([typed], { type: this.mimeType() }));
            this.downloadUrl.set(this.objectUrl);

            if (kind === 'pdf') {
              this.pdfUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(this.objectUrl));
            }
          }

          // DOCX dựng sau khi template tạo #docxHost; các định dạng khác hiển thị ngay.
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.error.set(this.messageFor(error));
          this.loading.set(false);
        },
      });
  }

  private mimeType(): string {
    const extension = fileExtension(this.fileName());

    if (extension === 'PDF') {
      return 'application/pdf';
    }

    if (extension === 'PPTX') {
      return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    }

    return 'application/octet-stream';
  }

  private messageFor(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 401) {
        return 'Bạn cần đăng nhập để xem tệp này.';
      }

      if (error.status === 403) {
        return 'Tệp này đang chờ duyệt nên chỉ tác giả và quản trị viên xem được.';
      }

      if (error.status === 404) {
        return 'Tệp không tồn tại hoặc đã bị xoá.';
      }
    }

    return 'Không tải được tệp để xem trước.';
  }

  private releaseObjectUrl(): void {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
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
        }
      })
      .catch(() => {
        container.remove();

        if (container !== this.activeDocx) {
          return;
        }

        this.activeDocx = null;
        this.error.set('Không dựng được bản xem trước tệp này.');
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
