import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AdminUserDetail, AdminUserSummary, PaginationMeta } from '../../../core/models';
import { AdminService } from '../../../core/services/admin.service';
import { getApiErrorMessages } from '../../../core/utils/api-error.util';
import { initials } from '../../../core/utils/format.util';

const PAGE_SIZE = 10;

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Hoạt động',
  WARNED: 'Đã cảnh báo',
  BANNED: 'Bị khoá',
};

/**
 * Quản lý tài khoản (admin).
 *
 * Tìm theo email/họ tên/mã SV, lọc role + trạng thái + "chỉ tài khoản bị cảnh báo".
 * Chọn một dòng để xem chi tiết và 10 cảnh báo gần nhất; gửi cảnh báo kèm lý do
 * (backend tự khoá tài khoản ở cảnh báo thứ 3 và trả chi tiết mới).
 */
@Component({
  selector: 'app-admin-users',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, DatePipe],
  templateUrl: './admin-users.html',
  styleUrl: './admin-users.css',
})
export class AdminUsers implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly adminService = inject(AdminService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly loading = signal(true);
  protected readonly loadingDetail = signal(false);
  protected readonly errors = signal<string[]>([]);
  protected readonly success = signal<string | null>(null);
  protected readonly items = signal<AdminUserSummary[]>([]);
  protected readonly meta = signal<PaginationMeta>({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 0 });
  protected readonly selected = signal<AdminUserDetail | null>(null);
  protected readonly warning = signal(false);
  protected readonly warnError = signal<string | null>(null);

  protected readonly filters = this.fb.nonNullable.group({
    keyword: [''],
    role: [''],
    status: [''],
    warnedOnly: [false],
  });

  protected readonly warnForm = this.fb.nonNullable.group({
    reason: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(500)]],
  });

  /**
   * URL là nguồn sự thật của bộ lọc: F5, Back hay gửi link cho đồng nghiệp đều
   * giữ đúng keyword/role/status/warnedOnly/page.
   */
  ngOnInit(): void {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      this.filters.setValue({
        keyword: params.get('keyword') ?? '',
        role: params.get('role') ?? '',
        status: params.get('status') ?? '',
        warnedOnly: params.get('warnedOnly') === 'true',
      });

      this.fetch(Number(params.get('page')) || 1);
    });
  }

  protected userInitials(fullName: string): string {
    return initials(fullName);
  }

  protected statusLabel(status: string): string {
    return STATUS_LABEL[status] ?? status;
  }

  protected statusBadgeClass(status: string): string {
    const base = 'shrink-0 rounded-md px-2 py-0.5 text-[11px] font-bold';

    if (status === 'BANNED') {
      return `${base} bg-rose-50 text-rose-700`;
    }

    if (status === 'WARNED') {
      return `${base} bg-amber-50 text-amber-700`;
    }

    return `${base} bg-emerald-50 text-emerald-700`;
  }

  protected applyFilters(): void {
    this.success.set(null);
    this.writeUrl(1);
  }

  protected goToPage(page: number): void {
    if (page < 1 || (this.meta().totalPages > 0 && page > this.meta().totalPages)) {
      return;
    }

    this.writeUrl(page);
  }

  /** Ghi bộ lọc hiện tại lên URL; subscription queryParamMap sẽ gọi fetch. */
  private writeUrl(page: number): void {
    const { keyword, role, status, warnedOnly } = this.filters.getRawValue();
    const queryParams: Record<string, string | number> = {};

    if (keyword.trim()) {
      queryParams['keyword'] = keyword.trim();
    }
    if (role) {
      queryParams['role'] = role;
    }
    if (status) {
      queryParams['status'] = status;
    }
    if (warnedOnly) {
      queryParams['warnedOnly'] = 'true';
    }
    if (page > 1) {
      queryParams['page'] = page;
    }

    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      replaceUrl: true,
    });
  }

  protected selectUser(id: string): void {
    this.loadingDetail.set(true);
    this.warnError.set(null);
    this.warnForm.reset({ reason: '' });

    this.adminService
      .user(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (user) => {
          this.selected.set(user);
          this.loadingDetail.set(false);
        },
        error: (error: unknown) => {
          this.errors.set(getApiErrorMessages(error));
          this.loadingDetail.set(false);
        },
      });
  }

  protected warn(user: AdminUserDetail): void {
    if (this.warnForm.invalid) {
      this.warnForm.markAllAsTouched();
      this.warnError.set('Lý do cảnh báo phải có ít nhất 10 ký tự.');
      return;
    }

    this.warning.set(true);
    this.warnError.set(null);
    this.errors.set([]);
    this.success.set(null);

    this.adminService
      .warnUser(user.id, this.warnForm.controls.reason.value)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.warning.set(false);
          this.selected.set(updated);
          this.warnForm.reset({ reason: '' });
          this.success.set(
            updated.status === 'BANNED'
              ? `Đã gửi cảnh báo thứ ${updated.warningCount}. Tài khoản đã bị khoá.`
              : `Đã gửi cảnh báo thứ ${updated.warningCount} cho ${updated.fullName}.`,
          );
          this.fetch(this.meta().page, false);
        },
        error: (error: unknown) => {
          this.warning.set(false);
          this.warnError.set(getApiErrorMessages(error).join(' '));
        },
      });
  }

  private fetch(page: number, showLoading = true): void {
    if (showLoading) {
      this.loading.set(true);
    }
    this.errors.set([]);

    const { keyword, role, status, warnedOnly } = this.filters.getRawValue();

    this.adminService
      .users({
        keyword: keyword.trim() || undefined,
        role: role ? (role as 'USER' | 'ADMIN') : undefined,
        status: status ? (status as 'ACTIVE' | 'WARNED' | 'BANNED') : undefined,
        warnedOnly: warnedOnly || undefined,
        page,
        limit: PAGE_SIZE,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.items.set(result.items);
          this.meta.set(result.meta);
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.errors.set(getApiErrorMessages(error));
          this.loading.set(false);
        },
      });
  }
}
