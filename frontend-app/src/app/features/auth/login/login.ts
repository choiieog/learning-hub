import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { getApiErrorCode, getApiErrorMessages } from '../../../core/utils/api-error.util';

/**
 * Login form.
 * - 403 EMAIL_NOT_VERIFIED → offers a "gửi lại email xác thực" action;
 * - honours the `redirect` query param set by authGuard;
 * - admins land on /admin/dashboard, students on /dashboard.
 */
@Component({
  selector: 'app-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  protected readonly submitting = signal(false);
  protected readonly errorMessages = signal<string[]>([]);
  protected readonly requiresVerification = signal(false);
  protected readonly resending = signal(false);
  protected readonly resendMessage = signal<string | null>(null);

  protected showError(control: 'email' | 'password'): boolean {
    const field = this.form.controls[control];
    return field.touched && field.invalid;
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.errorMessages.set([]);
    this.requiresVerification.set(false);
    this.resendMessage.set(null);

    this.auth.login(this.form.getRawValue()).subscribe({
      next: (session) => {
        this.submitting.set(false);

        const redirect = this.route.snapshot.queryParamMap.get('redirect');
        const fallback = session.user.role === 'ADMIN' ? '/admin/dashboard' : '/dashboard';
        const target = redirect?.startsWith('/') ? redirect : fallback;

        void this.router.navigateByUrl(target);
      },
      error: (error: unknown) => {
        this.submitting.set(false);
        const code = getApiErrorCode(error);
        this.requiresVerification.set(code === 'EMAIL_NOT_VERIFIED');

        // The verification panel below already says the account is unverified,
        // so a red alert with the same sentence would only duplicate it.
        this.errorMessages.set(code === 'EMAIL_NOT_VERIFIED' ? [] : getApiErrorMessages(error));
      },
    });
  }

  protected resend(): void {
    const email = this.form.controls.email.value.trim();

    if (!email) {
      this.form.controls.email.markAsTouched();
      return;
    }

    this.resending.set(true);
    this.resendMessage.set(null);
    this.errorMessages.set([]);

    this.auth.resendVerification(email).subscribe({
      next: (result) => {
        this.resending.set(false);
        this.resendMessage.set(result.message);
      },
      error: (error: unknown) => {
        this.resending.set(false);
        this.errorMessages.set(getApiErrorMessages(error));
      },
    });
  }
}
