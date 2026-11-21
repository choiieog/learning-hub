import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { getApiErrorMessages } from '../../../core/utils/api-error.util';
import { passwordValidators } from '../../../core/validators/password.validator';

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
  templateUrl: './reset-password.html',
  styleUrl: './reset-password.css',
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
      newPassword: ['', passwordValidators],
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
