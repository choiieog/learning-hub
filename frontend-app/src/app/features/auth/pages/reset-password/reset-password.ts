import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../../core/services/auth.service';
import { getApiErrorMessages } from '../../../../core/utils/api-error.util';

/** `confirmPassword` phải trùng `newPassword`. */
function passwordMatchValidator(group: AbstractControl): ValidationErrors | null {
  const newPassword = group.get('newPassword')?.value;
  const confirmPassword = group.get('confirmPassword')?.value;

  if (!confirmPassword) {
    return null;
  }

  return newPassword === confirmPassword ? null : { passwordMismatch: true };
}

/**
 * Trang đích của link trong email (`/auth/reset-password?token=...`).
 *
 * Token dùng một lần, hạn 1 giờ; đặt lại thành công thì backend thu hồi mọi phiên
 * nên người dùng phải đăng nhập lại bằng mật khẩu mới.
 */
@Component({
  selector: 'app-reset-password',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <h1 class="auth-title">Đặt lại mật khẩu</h1>

    @if (!token()) {
      <p class="auth-subtitle">Link không hợp lệ vì thiếu token.</p>
      <div class="alert alert-error mt-6" role="alert">
        <p>Hãy yêu cầu một link đặt lại mật khẩu mới qua email.</p>
      </div>
      <a class="btn-primary mt-2" routerLink="/auth/forgot-password">Yêu cầu link mới</a>
    } @else if (successMessage()) {
      <p class="auth-subtitle">Mật khẩu của bạn đã được cập nhật.</p>
      <div class="alert alert-success mt-6" role="status">
        <p>{{ successMessage() }}</p>
      </div>
      <a class="btn-primary mt-2" routerLink="/auth/login">Đăng nhập ngay</a>
    } @else {
      <p class="auth-subtitle">
        Chọn mật khẩu mới cho tài khoản của bạn. Link chỉ dùng được một lần.
      </p>

      <form class="mt-6" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        @if (errors().length > 0) {
          <div class="alert alert-error" role="alert" aria-live="polite">
            @for (error of errors(); track error) {
              <p>{{ error }}</p>
            }
          </div>
          <p class="mt-2 text-sm text-slate-500">
            Link đã hết hạn?
            <a class="auth-link" routerLink="/auth/forgot-password">Yêu cầu link mới</a>
          </p>
        }

        <div class="field">
          <label class="field-label" for="newPassword">Mật khẩu mới</label>
          <input
            id="newPassword"
            class="field-input"
            type="password"
            formControlName="newPassword"
            autocomplete="new-password"
            [attr.aria-invalid]="showError('newPassword')"
          />
          @if (showError('newPassword')) {
            <p class="field-error">
              Mật khẩu 8–72 ký tự, gồm ít nhất một chữ cái và một chữ số.
            </p>
          }
        </div>

        <div class="field">
          <label class="field-label" for="confirmPassword">Nhập lại mật khẩu mới</label>
          <input
            id="confirmPassword"
            class="field-input"
            type="password"
            formControlName="confirmPassword"
            autocomplete="new-password"
            [attr.aria-invalid]="showError('confirmPassword')"
          />
          @if (showError('confirmPassword')) {
            <p class="field-error">Mật khẩu nhập lại không khớp.</p>
          }
        </div>

        <button class="btn-primary mt-6" type="submit" [disabled]="submitting()">
          {{ submitting() ? 'Đang lưu...' : 'Đặt lại mật khẩu' }}
        </button>
      </form>

      <p class="mt-6 text-center text-sm text-slate-500">
        <a class="auth-link" routerLink="/auth/login">Quay lại đăng nhập</a>
      </p>
    }
  `,
})
export class ResetPassword {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);

  /** Filled by withComponentInputBinding() from the `?token=` query param. */
  readonly token = input<string>();

  protected readonly submitting = signal(false);
  protected readonly errors = signal<string[]>([]);
  protected readonly successMessage = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group(
    {
      newPassword: [
        '',
        [
          Validators.required,
          Validators.minLength(8),
          Validators.maxLength(72),
          Validators.pattern(/^(?=.*[A-Za-z])(?=.*\d).+$/),
        ],
      ],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: passwordMatchValidator },
  );

  protected showError(control: 'newPassword' | 'confirmPassword'): boolean {
    const field = this.form.controls[control];
    if (field.touched && field.invalid) {
      return true;
    }

    return (
      control === 'confirmPassword' &&
      this.form.controls.confirmPassword.touched &&
      this.form.hasError('passwordMismatch')
    );
  }

  protected submit(): void {
    const token = this.token()?.trim();
    if (!token) {
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.errors.set([]);

    this.auth.resetPassword({ token, newPassword: this.form.controls.newPassword.value }).subscribe({
      next: (result) => {
        this.submitting.set(false);
        this.form.reset();
        this.successMessage.set(result.message);
      },
      error: (error: unknown) => {
        this.submitting.set(false);
        this.errors.set(getApiErrorMessages(error));
      },
    });
  }
}
