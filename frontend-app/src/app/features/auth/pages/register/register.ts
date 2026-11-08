import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { RouterLink } from '@angular/router';
import { RegisterPayload } from '../../../../core/models';
import { AuthService } from '../../../../core/services/auth.service';
import { getApiErrorMessages } from '../../../../core/utils/api-error.util';

/** Cross-field check: the confirmation must equal the password. */
function passwordsMatch(group: AbstractControl): ValidationErrors | null {
  const password = group.get('password')?.value;
  const confirmPassword = group.get('confirmPassword')?.value;

  return password === confirmPassword ? null : { passwordMismatch: true };
}

/**
 * Registration form. The account is created unverified, so success shows a
 * "check your inbox" panel (with resend) instead of logging the user in.
 */
@Component({
  selector: 'app-register',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    @if (registeredEmail(); as email) {
      <h1 class="auth-title">Kiểm tra hộp thư của bạn</h1>
      <p class="auth-subtitle">Tài khoản đã được tạo nhưng chưa kích hoạt.</p>

      <div class="alert alert-success mt-6" role="status">
        <p>
          Đã gửi link xác thực tới <span class="font-medium">{{ email }}</span
          >. Mở link trong email để kích hoạt tài khoản, sau đó quay lại đăng nhập.
        </p>
      </div>

      @if (resendError()) {
        <p class="alert alert-error" role="alert">{{ resendError() }}</p>
      }

      @if (resendMessage()) {
        <p class="alert alert-info" role="status">{{ resendMessage() }}</p>
      }

      <button
        type="button"
        class="btn-secondary mt-2 w-full"
        [disabled]="resending()"
        (click)="resend()"
      >
        {{ resending() ? 'Đang gửi...' : 'Gửi lại email xác thực' }}
      </button>

      <p class="mt-6 text-center text-sm text-slate-500">
        <a class="auth-link" routerLink="/auth/login">Quay lại đăng nhập</a>
      </p>
    } @else {
      <h1 class="auth-title">Tạo tài khoản</h1>
      <p class="auth-subtitle">Đăng ký bằng email của bạn — chúng tôi sẽ gửi link xác thực.</p>

      <form class="mt-6" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        @if (errorMessages().length > 0) {
          <div class="alert alert-error" role="alert" aria-live="polite">
            @for (message of errorMessages(); track message) {
              <p>{{ message }}</p>
            }
          </div>
        }

        <div class="field">
          <label class="field-label" for="fullName">Họ và tên</label>
          <input
            id="fullName"
            class="field-input"
            type="text"
            formControlName="fullName"
            autocomplete="name"
            placeholder="Nguyễn Văn A"
          />
          @if (showError('fullName')) {
            <p class="field-error">Nhập họ tên của bạn.</p>
          }
        </div>

        <div class="field">
          <label class="field-label" for="email">Email</label>
          <input
            id="email"
            class="field-input"
            type="email"
            formControlName="email"
            autocomplete="email"
            placeholder="tenban@example.com"
          />
          @if (showError('email')) {
            <p class="field-error">Nhập địa chỉ email hợp lệ.</p>
          }
        </div>

        <div class="field">
          <label class="field-label" for="studentCode">Mã số sinh viên (không bắt buộc)</label>
          <input
            id="studentCode"
            class="field-input"
            type="text"
            formControlName="studentCode"
            autocomplete="off"
            placeholder="20210001"
          />
        </div>

        <div class="field">
          <label class="field-label" for="password">Mật khẩu</label>
          <input
            id="password"
            class="field-input"
            type="password"
            formControlName="password"
            autocomplete="new-password"
          />
          <p class="field-hint">Ít nhất 8 ký tự.</p>
          @if (showError('password')) {
            <p class="field-error">Mật khẩu phải có ít nhất 8 ký tự.</p>
          }
        </div>

        <div class="field">
          <label class="field-label" for="confirmPassword">Nhập lại mật khẩu</label>
          <input
            id="confirmPassword"
            class="field-input"
            type="password"
            formControlName="confirmPassword"
            autocomplete="new-password"
          />
          @if (showMismatch()) {
            <p class="field-error">Mật khẩu nhập lại không khớp.</p>
          }
        </div>

        <button class="btn-primary mt-6" type="submit" [disabled]="submitting()">
          {{ submitting() ? 'Đang tạo tài khoản...' : 'Đăng ký' }}
        </button>
      </form>

      <p class="mt-6 text-center text-sm text-slate-500">
        Đã có tài khoản?
        <a class="auth-link" routerLink="/auth/login">Đăng nhập</a>
      </p>
    }
  `,
})
export class Register {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);

  protected readonly form = this.fb.nonNullable.group(
    {
      fullName: ['', [Validators.required]],
      email: ['', [Validators.required, Validators.email]],
      studentCode: [''],
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: passwordsMatch },
  );

  protected readonly submitting = signal(false);
  protected readonly errorMessages = signal<string[]>([]);
  protected readonly registeredEmail = signal<string | null>(null);
  protected readonly resending = signal(false);
  protected readonly resendMessage = signal<string | null>(null);
  protected readonly resendError = signal<string | null>(null);

  protected showError(control: 'fullName' | 'email' | 'password' | 'confirmPassword'): boolean {
    const field = this.form.controls[control];
    return field.touched && field.invalid;
  }

  protected showMismatch(): boolean {
    const confirm = this.form.controls.confirmPassword;
    return confirm.touched && this.form.hasError('passwordMismatch');
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    const studentCode = value.studentCode.trim();

    const payload: RegisterPayload = {
      email: value.email.trim(),
      password: value.password,
      fullName: value.fullName.trim(),
      ...(studentCode ? { studentCode } : {}),
    };

    this.submitting.set(true);
    this.errorMessages.set([]);

    this.auth.register(payload).subscribe({
      next: () => {
        this.submitting.set(false);
        this.registeredEmail.set(payload.email);
      },
      error: (error: unknown) => {
        this.submitting.set(false);
        this.errorMessages.set(getApiErrorMessages(error));
      },
    });
  }

  protected resend(): void {
    const email = this.registeredEmail();

    if (!email) {
      return;
    }

    this.resending.set(true);
    this.resendMessage.set(null);
    this.resendError.set(null);

    this.auth.resendVerification(email).subscribe({
      next: (result) => {
        this.resending.set(false);
        this.resendMessage.set(result.message);
      },
      error: (error: unknown) => {
        this.resending.set(false);
        this.resendError.set(getApiErrorMessages(error)[0]);
      },
    });
  }
}
