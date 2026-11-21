import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { getApiErrorMessages } from '../../../core/utils/api-error.util';

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
  templateUrl: './verify-email.html',
  styleUrl: './verify-email.css',
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
