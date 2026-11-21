import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { RouterLink } from '@angular/router';
import { RegisterPayload } from '../../../core/models';
import { AuthService } from '../../../core/services/auth.service';
import { getApiErrorMessages } from '../../../core/utils/api-error.util';
import { passwordValidators } from '../../../core/validators/password.validator';

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
  templateUrl: './register.html',
  styleUrl: './register.css',
})
export class Register {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);

  protected readonly form = this.fb.nonNullable.group(
    {
      fullName: ['', [Validators.required, Validators.maxLength(120)]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', passwordValidators],
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

    const payload: RegisterPayload = {
      email: value.email.trim(),
      password: value.password,
      fullName: value.fullName.trim(),
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
