import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AdminService } from '../../../../core/services/admin.service';
import { getApiErrorMessages } from '../../../../core/utils/api-error.util';

/**
 * Cấu hình hệ thống (admin).
 *
 * Hiện có một công tắc: cho phép hay tạm khoá việc đăng tài liệu. Backend đọc
 * `SystemSetting.document.uploadsEnabled` ngay trong `DocumentsService.create`, nên lưu
 * ở đây là áp dụng tức thì cho mọi sinh viên; tắt thì bài mới bị chặn với 403.
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
        <div class="mt-4 h-5 w-2/3 rounded bg-slate-100"></div>
        <div class="mt-4 h-9 w-32 rounded bg-slate-100"></div>
      </div>
    } @else {
      <form
        class="mt-6 max-w-2xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
        [formGroup]="form"
        (ngSubmit)="save()"
      >
        <h2 class="text-base font-semibold">Đăng tài liệu</h2>
        <p class="mt-1 text-sm text-slate-500">
          Tắt để tạm khoá: sinh viên không tạo được bài mới. Bài đã đăng vẫn hiển thị bình
          thường và bật lại là đăng được ngay.
        </p>

        <label
          class="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 px-4 py-3"
          for="uploadsEnabled"
        >
          <input
            id="uploadsEnabled"
            type="checkbox"
            class="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            formControlName="uploadsEnabled"
          />
          <span>
            <span class="block text-sm font-medium text-slate-900">
              Cho phép sinh viên đăng tài liệu
            </span>
            <span class="block text-sm text-slate-500">
              Bỏ chọn = tạm khoá đăng bài trên toàn hệ thống.
            </span>
          </span>
        </label>

        <p class="mt-3 text-sm text-slate-600">
          Đang áp dụng: <strong>{{ currentLabel() }}</strong>
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

  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly success = signal<string | null>(null);
  protected readonly errors = signal<string[]>([]);
  protected readonly currentEnabled = signal<boolean | null>(null);

  protected readonly form = this.fb.nonNullable.group({ uploadsEnabled: [true] });

  ngOnInit(): void {
    this.adminApi
      .settings()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (settings) => {
          this.currentEnabled.set(settings.uploadsEnabled);
          this.form.setValue({ uploadsEnabled: settings.uploadsEnabled });
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.errors.set(getApiErrorMessages(error));
          this.loading.set(false);
        },
      });
  }

  protected currentLabel(): string {
    const enabled = this.currentEnabled();

    if (enabled === null) {
      return '—';
    }

    return enabled ? 'Đang cho phép đăng bài' : 'Đang tạm khoá đăng bài';
  }

  protected save(): void {
    this.saving.set(true);
    this.errors.set([]);
    this.success.set(null);

    const { uploadsEnabled } = this.form.getRawValue();

    this.adminApi
      .updateSettings({ uploadsEnabled })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (settings) => {
          this.saving.set(false);
          this.currentEnabled.set(settings.uploadsEnabled);
          this.success.set(
            settings.uploadsEnabled
              ? 'Đã bật đăng tài liệu.'
              : 'Đã tắt đăng tài liệu — sinh viên không tạo được bài mới.',
          );
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.errors.set(getApiErrorMessages(error));
        },
      });
  }
}
