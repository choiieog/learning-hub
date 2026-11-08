import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AdminService } from '../../../../core/services/admin.service';
import { getApiErrorMessages } from '../../../../core/utils/api-error.util';

const MAX_DAILY_LIMIT = 50;

/**
 * Cấu hình hệ thống (admin).
 *
 * Hiện có giới hạn số bài đăng mỗi ngày: backend đọc `SystemSetting` ngay trong
 * `DocumentsService.create`, nên lưu ở đây là áp dụng tức thì cho mọi sinh viên.
 * `0` nghĩa là không giới hạn (mặc định).
 */
@Component({
  selector: 'app-admin-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Cấu hình hệ thống</h1>
        <p class="mt-1 text-sm text-slate-500">
          Áp dụng ngay cho toàn bộ sinh viên, không cần khởi động lại backend.
        </p>
      </div>
      <a routerLink="/admin/dashboard" class="btn-secondary w-auto">Về tổng quan</a>
    </div>

    @if (success()) {
      <div class="alert alert-success mt-6" role="status">
        <p>{{ success() }}</p>
      </div>
    }

    @if (errors().length > 0) {
      <div class="alert alert-error mt-6" role="alert">
        @for (error of errors(); track error) {
          <p>{{ error }}</p>
        }
      </div>
    }

    @if (loading()) {
      <div class="mt-6 max-w-2xl animate-pulse rounded-xl border border-slate-200 bg-white p-6">
        <div class="h-4 w-1/3 rounded bg-slate-200"></div>
        <div class="mt-4 h-10 w-40 rounded bg-slate-100"></div>
        <div class="mt-4 h-9 w-32 rounded bg-slate-100"></div>
      </div>
    } @else {
      <form
        class="mt-6 max-w-2xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
        [formGroup]="form"
        (ngSubmit)="save()"
        novalidate
      >
        <h2 class="text-base font-semibold">Giới hạn đăng bài</h2>
        <p class="mt-1 text-sm text-slate-500">
          Số tài liệu tối đa mỗi sinh viên được đăng trong một ngày (theo giờ Việt Nam). Đặt
          <strong>0</strong> để không giới hạn. Bài đã xoá vẫn được tính vì giới hạn chống spam.
        </p>

        <div class="field mt-4">
          <label class="field-label" for="documentDailyLimit">Số bài tối đa / ngày</label>
          <input
            id="documentDailyLimit"
            class="field-input max-w-40"
            type="number"
            min="0"
            [attr.max]="maxDailyLimit"
            step="1"
            formControlName="documentDailyLimit"
            [attr.aria-invalid]="showError()"
          />
          @if (showError()) {
            <p class="field-error">Giá trị từ 0 đến {{ maxDailyLimit }}.</p>
          }
        </div>

        <p class="mt-3 text-sm text-slate-600">
          Đang áp dụng:
          <strong>{{ currentLabel() }}</strong>
        </p>

        <button class="btn-primary mt-5 w-auto" type="submit" [disabled]="saving()">
          {{ saving() ? 'Đang lưu...' : 'Lưu cấu hình' }}
        </button>
      </form>
    }
  `,
})
export class AdminSettings implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly adminApi = inject(AdminService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly maxDailyLimit = MAX_DAILY_LIMIT;
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly success = signal<string | null>(null);
  protected readonly errors = signal<string[]>([]);
  protected readonly currentLimit = signal<number | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    documentDailyLimit: [
      0,
      [Validators.required, Validators.min(0), Validators.max(MAX_DAILY_LIMIT)],
    ],
  });

  ngOnInit(): void {
    this.adminApi
      .settings()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (settings) => {
          this.currentLimit.set(settings.documentDailyLimit);
          this.form.setValue({ documentDailyLimit: settings.documentDailyLimit });
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.errors.set(getApiErrorMessages(error));
          this.loading.set(false);
        },
      });
  }

  protected showError(): boolean {
    const field = this.form.controls.documentDailyLimit;

    return field.touched && field.invalid;
  }

  protected currentLabel(): string {
    const limit = this.currentLimit();

    if (limit === null) {
      return '—';
    }

    return limit === 0 ? 'Không giới hạn' : `${limit} bài/ngày`;
  }

  protected save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.errors.set([]);
    this.success.set(null);

    const { documentDailyLimit } = this.form.getRawValue();

    this.adminApi
      .updateSettings({ documentDailyLimit })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (settings) => {
          this.saving.set(false);
          this.currentLimit.set(settings.documentDailyLimit);
          this.success.set(
            settings.documentDailyLimit === 0
              ? 'Đã tắt giới hạn đăng bài.'
              : `Đã đặt giới hạn ${settings.documentDailyLimit} bài/ngày.`,
          );
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.errors.set(getApiErrorMessages(error));
        },
      });
  }
}
