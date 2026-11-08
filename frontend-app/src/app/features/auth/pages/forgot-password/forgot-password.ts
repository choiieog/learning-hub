import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../../core/services/auth.service';
import { getApiErrorMessages } from '../../../../core/utils/api-error.util';

/**
 * Yêu cầu link đặt lại mật khẩu (`/auth/forgot-password`).
 *
 * Backend luôn trả cùng một message dù email có tồn tại hay không (chống dò tài khoản),
 * nên trang chỉ hiển thị message đó thay vì báo "email không tồn tại".
 */
@Component({
  selector: 'app-forgot-password',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <h1 class="auth-title">Quên mật khẩu</h1>
    <p class="auth-subtitle">
      Nhập email đã đăng ký, chúng tôi sẽ gửi link đặt lại mật khẩu. Link có hiệu lực 1 giờ.
    </p>

    @if (sentMessage()) {
      <div class="alert alert-success mt-6" role="status">
        <p>{{ sentMessage() }}</p>
      </div>
      <p class="mt-2 text-sm text-slate-500">
        Không thấy email? Kiểm tra thư mục spam hoặc thử lại sau vài phút.
      </p>
      <a class="btn-secondary mt-4" routerLink="/auth/login">Quay lại đăng nhập</a>
    } @else {
      <form class="mt-6" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        @if (errors().length > 0) {
          <div class="alert alert-error" role="alert" aria-live="polite">
            @for (error of errors(); track error) {
              <p>{{ error }}</p>
            }
          </div>
        }

        <div class="field">
          <label class="field-label" for="email">Email</label>
          <input
            id="email"
            class="field-input"
            type="email"
            formControlName="email"
            autocomplete="email"
            placeholder="tenban@example.com"
            [attr.aria-invalid]="showError()"
          />
          @if (showError()) {
            <p class="field-error">Nhập địa chỉ email hợp lệ.</p>
          }
        </div>

        <button class="btn-primary mt-6" type="submit" [disabled]="submitting()">
          {{ submitting() ? 'Đang gửi...' : 'Gửi link đặt lại mật khẩu' }}
        </button>
      </form>

      <p class="mt-6 text-center text-sm text-slate-500">
        <a class="auth-link" routerLink="/auth/login">Quay lại đăng nhập</a>
      </p>
    }
  `,
})
export class ForgotPassword {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);

  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });

  protected readonly submitting = signal(false);
  protected readonly errors = signal<string[]>([]);
  protected readonly sentMessage = signal<string | null>(null);

  protected showError(): boolean {
    const field = this.form.controls.email;
    return field.touched && field.invalid;
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.errors.set([]);

    this.auth.forgotPassword(this.form.controls.email.value.trim()).subscribe({
      next: (result) => {
        this.submitting.set(false);
        this.sentMessage.set(result.message);
      },
      error: (error: unknown) => {
        this.submitting.set(false);
        this.errors.set(getApiErrorMessages(error));
      },
    });
  }
}
