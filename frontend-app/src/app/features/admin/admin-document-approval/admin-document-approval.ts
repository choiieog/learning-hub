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
import { RouterLink } from '@angular/router';
import {
  DocumentFile,
  DocumentStatus,
  DocumentSummary,
  PaginationMeta,
} from '../../../core/models';
import { AdminService } from '../../../core/services/admin.service';
import { getApiErrorMessages } from '../../../core/utils/api-error.util';
import { DOCUMENT_STATUS_LABEL } from '../../../core/utils/document-status.util';
import { fileExtension, formatFileSize, initials } from '../../../core/utils/format.util';

const PAGE_SIZE = 10;
const MIN_REJECT_REASON = 10;

type StatusTab = { value: DocumentStatus; label: string };

/**
 * Phê duyệt bài viết (admin).
 *
 * Danh sách theo trạng thái + panel xem trước: PDF hiển thị ngay trong iframe
 * (file phục vụ từ /api/files), DOCX/PPTX mở ở tab mới. Duyệt, hoặc từ chối kèm
 * lý do — từ chối xoá hẳn tài liệu và gửi lý do cho tác giả qua thông báo.
 */
@Component({
  selector: 'app-admin-document-approval',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DatePipe],
  templateUrl: './admin-document-approval.html',
  styleUrl: './admin-document-approval.css',
})
export class AdminDocumentApproval implements OnInit {
  private readonly adminApi = inject(AdminService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly minRejectReason = MIN_REJECT_REASON;

  protected readonly tabs: StatusTab[] = [
    { value: 'PENDING', label: DOCUMENT_STATUS_LABEL.PENDING },
    { value: 'APPROVED', label: DOCUMENT_STATUS_LABEL.APPROVED },
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
  protected readonly busyId = signal<string | null>(null);
  protected readonly rejectTarget = signal<DocumentSummary | null>(null);
  protected readonly rejectReason = signal('');
  protected readonly rejectError = signal('');

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
  }

  protected statusLabel(status: DocumentStatus): string {
    return DOCUMENT_STATUS_LABEL[status];
  }

  protected fileTypeName(file: DocumentFile): string {
    return fileExtension(file.name);
  }

  protected size(file: DocumentFile): string {
    return formatFileSize(file.size);
  }

  /** Trang đọc nội dung tệp ở tab mới — xem `DocumentViewerPage`. */
  protected viewerHref(file: DocumentFile): string {
    return `/viewer?src=${encodeURIComponent(file.url)}&name=${encodeURIComponent(file.name)}`;
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
          this.success.set(`Đã từ chối, xoá "${target.title}" và gửi lý do cho tác giả.`);
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
