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
import { DocumentDetail, DocumentFile, DocumentStatus } from '../../../core/models';
import { AuthService } from '../../../core/services/auth.service';
import { DocumentService } from '../../../core/services/document.service';
import { getApiErrorMessages } from '../../../core/utils/api-error.util';
import { DOCUMENT_STATUS_LABEL } from '../../../core/utils/document-status.util';
import { fileExtension, formatFileSize, initials } from '../../../core/utils/format.util';
import { RatingSection } from '../../ratings/rating-section/rating-section';

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
  templateUrl: './document-detail.html',
  styleUrl: './document-detail.css',
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

  /** Trang đọc nội dung tệp ở tab mới — xem `DocumentViewerPage`. `doc` để breadcrumb quay lại đây. */
  protected viewerHref(file: DocumentFile): string {
    const id = this.documentId();
    const idParam = id ? `&doc=${encodeURIComponent(id)}` : '';

    return `/viewer?src=${encodeURIComponent(file.url)}&name=${encodeURIComponent(file.name)}${idParam}`;
  }

  protected authorInitials(fullName: string): string {
    return initials(fullName);
  }

  protected statusLabel(status: DocumentStatus): string {
    return DOCUMENT_STATUS_LABEL[status];
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
