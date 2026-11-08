import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AdminUserDetail, AdminUserSummary, PaginationMeta } from '../../../../core/models';
import { AdminService } from '../../../../core/services/admin.service';
import { getApiErrorMessages } from '../../../../core/utils/api-error.util';
import { initials } from '../../../../core/utils/format.util';

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
  template: `
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Quản lý tài khoản</h1>
        <p class="mt-1 text-sm text-slate-500">
          Tìm kiếm, xem lịch sử cảnh báo và gửi cảnh báo cho sinh viên vi phạm.
        </p>
      </div>
      <p class="text-sm text-slate-500">{{ meta().total }} tài khoản</p>
    </div>

    <form
      class="mt-5 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-5"
      [formGroup]="filters"
      (ngSubmit)="applyFilters()"
      novalidate
    >
      <div class="field lg:col-span-2">
        <label class="field-label" for="keyword">Tìm kiếm</label>
        <input
          id="keyword"
          class="field-input"
          type="search"
          formControlName="keyword"
          placeholder="Email, họ tên hoặc mã sinh viên"
        />
      </div>

      <div class="field">
        <label class="field-label" for="role">Vai trò</label>
        <select id="role" class="field-input" formControlName="role">
          <option value="">Tất cả</option>
          <option value="USER">Sinh viên</option>
          <option value="ADMIN">Quản trị viên</option>
        </select>
      </div>

      <div class="field">
        <label class="field-label" for="status">Trạng thái</label>
        <select id="status" class="field-input" formControlName="status">
          <option value="">Tất cả</option>
          <option value="ACTIVE">Hoạt động</option>
          <option value="WARNED">Đã cảnh báo</option>
          <option value="BANNED">Bị khoá</option>
        </select>
      </div>

      <div class="flex flex-col justify-end gap-2">
        <label class="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" formControlName="warnedOnly" class="h-4 w-4 rounded border-slate-300" />
          Chỉ tài khoản bị cảnh báo
        </label>
        <button class="btn-primary w-full" type="submit">Tìm kiếm</button>
      </div>
    </form>

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

    <div class="mt-5 grid gap-6 lg:grid-cols-5">
      <!-- Danh sách tài khoản -->
      <section class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm lg:col-span-3">
        @if (loading()) {
          <div class="space-y-2 p-3" aria-busy="true">
            @for (placeholder of [1, 2, 3, 4, 5]; track placeholder) {
              <div class="h-14 animate-pulse rounded-lg bg-slate-100"></div>
            }
          </div>
        } @else if (items().length === 0) {
          <p class="px-5 py-12 text-center text-sm text-slate-500">
            Không tìm thấy tài khoản nào khớp bộ lọc.
          </p>
        } @else {
          <ul class="divide-y divide-slate-100">
            @for (user of items(); track user.id) {
              <li>
                <button
                  type="button"
                  class="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-slate-50"
                  [class.bg-indigo-50]="selected()?.id === user.id"
                  (click)="selectUser(user.id)"
                >
                  <span
                    class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-700"
                    aria-hidden="true"
                  >
                    {{ userInitials(user.fullName) }}
                  </span>

                  <span class="min-w-0 flex-1">
                    <span class="flex flex-wrap items-center gap-2">
                      <span class="truncate text-sm font-semibold text-slate-900">
                        {{ user.fullName }}
                      </span>
                      <span [class]="statusBadgeClass(user.status)">
                        {{ statusLabel(user.status) }}
                      </span>
                      @if (user.role === 'ADMIN') {
                        <span class="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                          Admin
                        </span>
                      }
                    </span>
                    <span class="mt-0.5 block truncate text-xs text-slate-500">{{ user.email }}</span>
                    <span class="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-400">
                      @if (user.studentCode) {
                        <span>{{ user.studentCode }}</span>
                      }
                      <span>{{ user.documentCount }} tài liệu</span>
                      <span>{{ user.warningCount }} cảnh báo</span>
                      <span>Tham gia {{ user.createdAt | date: 'dd/MM/yyyy' }}</span>
                    </span>
                  </span>
                </button>
              </li>
            }
          </ul>

          <div class="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-sm">
            <p class="text-slate-500">
              Trang {{ meta().page }}/{{ meta().totalPages || 1 }}
            </p>
            <div class="flex gap-2">
              <button
                type="button"
                class="btn-secondary w-auto"
                [disabled]="meta().page <= 1"
                (click)="goToPage(meta().page - 1)"
              >
                Trước
              </button>
              <button
                type="button"
                class="btn-secondary w-auto"
                [disabled]="meta().page >= meta().totalPages"
                (click)="goToPage(meta().page + 1)"
              >
                Sau
              </button>
            </div>
          </div>
        }
      </section>

      <!-- Chi tiết + cảnh báo -->
      <section class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
        @if (loadingDetail()) {
          <div class="space-y-3" aria-busy="true">
            <div class="h-5 w-1/2 animate-pulse rounded bg-slate-200"></div>
            <div class="h-4 w-2/3 animate-pulse rounded bg-slate-100"></div>
            <div class="h-24 animate-pulse rounded bg-slate-100"></div>
          </div>
        } @else if (selected(); as user) {
          <h2 class="text-base font-semibold">{{ user.fullName }}</h2>
          <p class="mt-0.5 text-sm text-slate-500">{{ user.email }}</p>

          <div class="mt-3 flex flex-wrap items-center gap-2">
            <span [class]="statusBadgeClass(user.status)">{{ statusLabel(user.status) }}</span>
            <span class="text-xs text-slate-500">{{ user.warningCount }}/3 cảnh báo</span>
            @if (user.warningCount > 0) {
              <span class="text-xs text-slate-400">(đủ 3 sẽ tự khoá)</span>
            }
          </div>

          <dl class="mt-4 space-y-2 border-t border-slate-100 pt-3 text-sm">
            <div class="flex justify-between gap-3">
              <dt class="text-slate-500">Mã sinh viên</dt>
              <dd class="font-medium text-slate-800">{{ user.studentCode || '—' }}</dd>
            </div>
            <div class="flex justify-between gap-3">
              <dt class="text-slate-500">Tài liệu</dt>
              <dd class="font-medium text-slate-800">{{ user.documentCount }}</dd>
            </div>
            <div class="flex justify-between gap-3">
              <dt class="text-slate-500">Email xác thực</dt>
              <dd class="font-medium text-slate-800">
                {{ user.emailVerifiedAt ? 'Đã xác thực' : 'Chưa xác thực' }}
              </dd>
            </div>
            <div class="flex justify-between gap-3">
              <dt class="text-slate-500">Tham gia</dt>
              <dd class="font-medium text-slate-800">
                {{ user.createdAt | date: 'dd/MM/yyyy' }}
              </dd>
            </div>
          </dl>

          <div class="mt-5 border-t border-slate-100 pt-4">
            <h3 class="text-sm font-semibold text-slate-900">Lịch sử cảnh báo</h3>

            @if (user.warnings.length === 0) {
              <p class="mt-2 text-sm text-slate-500">Chưa có cảnh báo nào.</p>
            } @else {
              <ul class="mt-3 space-y-3">
                @for (warning of user.warnings; track warning.id) {
                  <li class="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2">
                    <p class="text-sm text-rose-800">{{ warning.reason }}</p>
                    <p class="mt-1 text-xs text-rose-600">
                      {{ warning.admin.fullName }} · {{ warning.createdAt | date: 'dd/MM/yyyy HH:mm' }}
                    </p>
                  </li>
                }
              </ul>
            }
          </div>

          @if (user.status === 'BANNED') {
            <p class="mt-4 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600">
              Tài khoản đã bị khoá — không gửi cảnh báo thêm được.
            </p>
          } @else {
            <form class="mt-4 border-t border-slate-100 pt-4" [formGroup]="warnForm" (ngSubmit)="warn(user)" novalidate>
              <label class="field-label" for="reason">Gửi cảnh báo</label>
              <textarea
                id="reason"
                class="field-input"
                formControlName="reason"
                rows="3"
                maxlength="500"
                placeholder="Lý do cảnh báo (ít nhất 10 ký tự), sinh viên sẽ thấy trong hồ sơ cảnh báo."
                [attr.aria-invalid]="warnError() !== null"
              ></textarea>
              @if (warnError()) {
                <p class="mt-1 text-sm text-rose-600" role="alert">{{ warnError() }}</p>
              }
              <button class="btn-primary mt-3 w-auto" type="submit" [disabled]="warning()">
                {{ warning() ? 'Đang gửi...' : 'Gửi cảnh báo' }}
              </button>
            </form>
          }
        } @else {
          <div class="py-10 text-center">
            <p class="text-sm font-medium text-slate-700">Chọn một tài khoản</p>
            <p class="mt-1 text-sm text-slate-500">
              Bấm vào dòng bên trái để xem chi tiết và lịch sử cảnh báo.
            </p>
          </div>
        }
      </section>
    </div>
  `,
})
export class AdminUsers implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly adminService = inject(AdminService);
  private readonly destroyRef = inject(DestroyRef);

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

  ngOnInit(): void {
    this.fetch(1);
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
    this.fetch(1);
  }

  protected goToPage(page: number): void {
    if (page < 1 || (this.meta().totalPages > 0 && page > this.meta().totalPages)) {
      return;
    }

    this.fetch(page);
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
