import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
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
 * Đổi mật khẩu.
 *
 * Backend (PATCH /api/auth/password) kiểm mật khẩu cũ, từ chối mật khẩu mới trùng mật khẩu cũ
 * rồi cấp lại token cho phiên hiện tại: các thiết bị khác bị đăng xuất nhưng người vừa đổi
 * mật khẩu tiếp tục dùng bình thường, không phải đăng nhập lại.
 */
@Component({
  selector: 'app-change-password',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './change-password.html',
  styleUrl: './change-password.css',
})
export class ChangePassword {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly submitting = signal(false);
  protected readonly success = signal<string | null>(null);
  protected readonly errors = signal<string[]>([]);
  protected readonly profilePath = this.auth.profilePath;

  /** Hiện/ẩn từng ô mật khẩu. */
  protected readonly visible = signal({
    currentPassword: false,
    newPassword: false,
    confirmPassword: false,
  });
  /** Giá trị mới nhất để vẽ thanh độ mạnh và dấu khớp, không cần subscribe form. */
  protected readonly newPasswordValue = signal('');
  protected readonly confirmPasswordValue = signal('');

  protected readonly checks = computed(() => {
    const value = this.newPasswordValue();

    return {
      length: value.length >= 8 && value.length <= 72,
      letter: /[A-Za-z]/.test(value),
      digit: /\d/.test(value),
      long: value.length >= 12,
    };
  });

  /** 0–4 điểm → nhãn + màu thanh độ mạnh. */
  protected readonly strength = computed(() => {
    const checks = this.checks();
    const score = [checks.length, checks.letter, checks.digit, checks.long].filter(Boolean).length;
    const labels = ['Chưa nhập', 'Yếu', 'Trung bình', 'Khá', 'Mạnh'];

    return { score, percent: score * 25, label: labels[score] };
  });

  protected readonly passwordsMatch = computed(() => {
    const confirm = this.confirmPasswordValue();

    return confirm.length > 0 && confirm === this.newPasswordValue();
  });

  protected onNewPasswordInput(event: Event): void {
    this.newPasswordValue.set((event.target as HTMLInputElement).value);
  }

  protected onConfirmPasswordInput(event: Event): void {
    this.confirmPasswordValue.set((event.target as HTMLInputElement).value);
  }

  protected toggleVisibility(control: 'currentPassword' | 'newPassword' | 'confirmPassword'): void {
    this.visible.update((state) => ({ ...state, [control]: !state[control] }));
  }

  protected readonly form = this.fb.nonNullable.group(
    {
      currentPassword: ['', [Validators.required]],
      newPassword: ['', passwordValidators],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: passwordMatchValidator },
  );

  protected showError(control: 'currentPassword' | 'newPassword' | 'confirmPassword'): boolean {
    const field = this.form.controls[control];
    if (field.touched && field.invalid) {
      return true;
    }

    // Lỗi "không khớp" gắn ở cấp form, hiện dưới ô nhập lại.
    return (
      control === 'confirmPassword' &&
      this.form.controls.confirmPassword.touched &&
      this.form.hasError('passwordMismatch')
    );
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.errors.set([]);

    const { currentPassword, newPassword } = this.form.getRawValue();

    this.auth
      .changePassword({ currentPassword, newPassword })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.submitting.set(false);
          // Backend cấp lại token cho phiên hiện tại → không phải đăng nhập lại.
          this.auth.setSession({ accessToken: result.accessToken, user: result.user });
          this.form.reset();
          this.newPasswordValue.set('');
          this.confirmPasswordValue.set('');
          this.success.set(result.message);
        },
        error: (error: unknown) => {
          this.submitting.set(false);
          this.errors.set(getApiErrorMessages(error));
        },
      });
  }
}
