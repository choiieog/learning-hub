import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AdminService } from '../../../../core/services/admin.service';
import { getApiErrorMessages } from '../../../../core/utils/api-error.util';

/**
 * Gửi thông báo hàng loạt (admin).
 *
 * Backend lưu một row `Notification.userId = null` (`POST /api/admin/notifications/broadcast`),
 * nên mọi sinh viên thấy cùng một tin trong chuông và trang `/notifications`.
 * Không sửa/xoá được sau khi gửi — nội dung nên là thông báo chung (bảo trì, lịch thi, quy định).
 */
@Component({
  selector: 'app-admin-broadcast',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Thông báo hàng loạt</h1>
        <p class="mt-1 text-sm text-slate-500">
          Gửi một thông báo chung tới tất cả sinh viên — hiện trong chuông và trang thông báo.
        </p>
      </div>
      <a routerLink="/admin/dashboard" class="btn-secondary w-auto">Về tổng quan</a>
    </div>

    @if (sent()) {
      <div class="alert alert-success mt-6" role="status">
        <p class="font-medium">Đã gửi thông báo</p>
        <p class="mt-1">“{{ sent() }}” đã xuất hiện trong thông báo của mọi sinh viên.</p>
        <a routerLink="/notifications" class="btn-primary mt-3 w-auto">Xem trang thông báo</a>
      </div>
    }

    @if (errors().length > 0) {
      <div class="alert alert-error mt-6" role="alert">
        @for (error of errors(); track error) {
          <p>{{ error }}</p>
        }
      </div>
    }

    <form
      class="mt-6 max-w-3xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      [formGroup]="form"
      (ngSubmit)="submit()"
      novalidate
    >
      <div class="field">
        <label class="field-label" for="title">Tiêu đề</label>
        <input
          id="title"
          class="field-input"
          type="text"
          formControlName="title"
          maxlength="120"
          placeholder="VD: Bảo trì hệ thống tối nay"
          [attr.aria-invalid]="showError('title')"
        />
        <p class="mt-1 text-right text-xs text-slate-400">
          {{ titleLength() }}/120 ký tự
        </p>
        @if (showError('title')) {
          <p class="field-error">Tiêu đề 5–120 ký tự.</p>
        }
      </div>

      <div class="field">
        <label class="field-label" for="message">Nội dung</label>
        <textarea
          id="message"
          class="field-input min-h-32"
          rows="6"
          formControlName="message"
          maxlength="1000"
          placeholder="VD: Hệ thống bảo trì từ 22:00 đến 23:00 ngày 10/11. Trong thời gian này bạn không đăng nhập được."
          [attr.aria-invalid]="showError('message')"
        ></textarea>
        <p class="mt-1 text-right text-xs text-slate-400">
          {{ messageLength() }}/1000 ký tự
        </p>
        @if (showError('message')) {
          <p class="field-error">Nội dung 10–1000 ký tự.</p>
        }
      </div>

      <div class="mt-2 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
        Thông báo gửi đi không sửa hay thu hồi được. Chỉ dùng cho thông tin chung, không dùng để
        nhắc riêng một tài khoản (dùng “Quản lý tài khoản” → gửi cảnh báo).
      </div>

      <button class="btn-primary mt-6" type="submit" [disabled]="submitting()">
        {{ submitting() ? 'Đang gửi...' : 'Gửi tới tất cả sinh viên' }}
      </button>
    </form>
  `,
})
export class AdminBroadcast {
  private readonly fb = inject(FormBuilder);
  private readonly adminApi = inject(AdminService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly submitting = signal(false);
  protected readonly sent = signal<string | null>(null);
  protected readonly errors = signal<string[]>([]);

  protected readonly form = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.minLength(5), Validators.maxLength(120)]],
    message: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(1000)]],
  });

  protected readonly titleLength = computed(() => this.form.controls.title.value.length);
  protected readonly messageLength = computed(() => this.form.controls.message.value.length);

  protected showError(control: 'title' | 'message'): boolean {
    const field = this.form.controls[control];

    return field.touched && field.invalid;
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.errors.set([]);

    const { title, message } = this.form.getRawValue();

    this.adminApi
      .broadcastNotification({ title: title.trim(), message: message.trim() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (notification) => {
          this.submitting.set(false);
          this.sent.set(notification.title);
          this.form.reset();
        },
        error: (error: unknown) => {
          this.submitting.set(false);
          this.errors.set(getApiErrorMessages(error));
        },
      });
  }
}
