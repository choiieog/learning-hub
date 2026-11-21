import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AdminService } from '../../../core/services/admin.service';
import { getApiErrorMessages } from '../../../core/utils/api-error.util';

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
  templateUrl: './admin-settings.html',
  styleUrl: './admin-settings.css',
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
