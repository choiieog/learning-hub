import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../../core/services/auth.service';
import { getApiErrorMessages } from '../../../../core/utils/api-error.util';

type VerificationStatus = 'verifying' | 'success' | 'error';

/**
 * Landing page of the verification link (`/auth/verify-email?token=...`).
 * The token is verified automatically on load; when it is missing, expired or
 * already used, the user can request a new link with their email.
 */
@Component({
  selector: 'app-verify-email',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <h1 class="auth-title">Xác thực email</h1>

    @switch (status()) {
      @case ('verifying') {
        <p class="auth-subtitle" role="status">Đang xác thực tài khoản của bạn...</p>
        <div class="mt-6 flex justify-center" aria-hidden="true">
          <span
            class="h-8 w-8 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600"
          ></span>
        </div>
      }

      @case ('success') {
        <p class="auth-subtitle">Tài khoản của bạn đã được kích hoạt.</p>
        <div class="alert alert-success mt-6" role="status">
          <p>{{ message() }}</p>
        </div>
        <a class="btn-primary mt-2" routerLink="/auth/login">Đăng nhập ngay</a>
      }

      @default {
        <p class="auth-subtitle">Không xác thực được bằng link này.</p>

        @if (errors().length > 0) {
          <div class="alert alert-error mt-6" role="alert" aria-live="polite">
            @for (error of errors(); track error) {
              <p>{{ error }}</p>
            }
          </div>
        }

        <form class="mt-2" [formGroup]="form" (ngSubmit)="resend()" novalidate>
          <div class="field">
            <label class="field-label" for="email">Email đã đăng ký</label>
            <input
              id="email"
              class="field-input"
              type="email"
              formControlName="email"
              autocomplete="email"
              placeholder="tenban@example.com"
            />
            @if (form.controls.email.touched && form.controls.email.invalid) {
              <p class="field-error">Nhập địa chỉ email hợp lệ.</p>
            }
          </div>

          <button class="btn-primary mt-6" type="submit" [disabled]="resending()">
            {{ resending() ? 'Đang gửi...' : 'Gửi lại link xác thực' }}
          </button>
        </form>

        @if (resendMessage()) {
          <p class="alert alert-info mt-4" role="status">{{ resendMessage() }}</p>
        }

        <p class="mt-6 text-center text-sm text-slate-500">
          <a class="auth-link" routerLink="/auth/login">Quay lại đăng nhập</a>
        </p>
      }
    }
  `,
})
export class VerifyEmail implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);

  /** Filled by withComponentInputBinding() from the `?token=` query param. */
  readonly token = input<string>();

  protected readonly status = signal<VerificationStatus>('verifying');
  protected readonly message = signal('Xác thực email thành công. Bạn có thể đăng nhập.');
  protected readonly errors = signal<string[]>([]);
  protected readonly resending = signal(false);
  protected readonly resendMessage = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });

  ngOnInit(): void {
    const token = this.token()?.trim();

    if (!token) {
      this.status.set('error');
      this.errors.set(['Link xác thực thiếu token. Nhập email để nhận link mới.']);
      return;
    }

    this.auth.verifyEmail(token).subscribe({
      next: (result) => {
        this.message.set(result.message);
        this.status.set('success');
      },
      error: (error: unknown) => {
        this.errors.set(getApiErrorMessages(error));
        this.status.set('error');
      },
    });
  }

  protected resend(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.resending.set(true);
    this.resendMessage.set(null);

    this.auth.resendVerification(this.form.getRawValue().email.trim()).subscribe({
      next: (result) => {
        this.resending.set(false);
        this.resendMessage.set(result.message);
      },
      error: (error: unknown) => {
        this.resending.set(false);
        this.errors.set(getApiErrorMessages(error));
      },
    });
  }
}
