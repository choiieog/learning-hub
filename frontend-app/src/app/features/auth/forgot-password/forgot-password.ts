import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { getApiErrorMessages } from '../../../core/utils/api-error.util';

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
  templateUrl: './forgot-password.html',
  styleUrl: './forgot-password.css',
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
