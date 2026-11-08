import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
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
 * Đổi mật khẩu.
 *
 * Backend (PATCH /api/auth/password) kiểm mật khẩu cũ, từ chối mật khẩu mới trùng mật khẩu cũ
 * và thu hồi mọi refresh token. Vì vậy sau khi đổi thành công, client xoá phiên hiện tại
 * và yêu cầu đăng nhập lại.
 */
@Component({
  selector: 'app-change-password',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Đổi mật khẩu</h1>
        <p class="mt-1 text-sm text-slate-500">
          Sau khi đổi, bạn cần đăng nhập lại trên mọi thiết bị.
        </p>
      </div>
      <a routerLink="/profile" class="btn-secondary w-auto">Quay lại hồ sơ</a>
    </div>

    @if (success()) {
      <div class="alert alert-success mt-6" role="status">
        <p class="font-medium">Đổi mật khẩu thành công</p>
        <p class="mt-1">{{ success() }}</p>
        <a routerLink="/auth/login" class="btn-primary mt-3 w-auto">Đăng nhập lại</a>
      </div>
    } @else {
      <form
        class="mt-6 max-w-xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
        [formGroup]="form"
        (ngSubmit)="submit()"
        novalidate
      >
        @if (errors().length > 0) {
          <div class="alert alert-error" role="alert">
            @for (error of errors(); track error) {
              <p>{{ error }}</p>
            }
          </div>
        }

        <div class="field">
          <label class="field-label" for="currentPassword">Mật khẩu hiện tại</label>
          <input
            id="currentPassword"
            class="field-input"
            type="password"
            formControlName="currentPassword"
            autocomplete="current-password"
            [attr.aria-invalid]="showError('currentPassword')"
          />
          @if (showError('currentPassword')) {
            <p class="field-error">Nhập mật khẩu hiện tại.</p>
          }
        </div>

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
          {{ submitting() ? 'Đang đổi mật khẩu...' : 'Đổi mật khẩu' }}
        </button>
      </form>
    }
  `,
})
export class ChangePassword {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly submitting = signal(false);
  protected readonly success = signal<string | null>(null);
  protected readonly errors = signal<string[]>([]);

  protected readonly form = this.fb.nonNullable.group(
    {
      currentPassword: ['', [Validators.required]],
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

  protected showError(
    control: 'currentPassword' | 'newPassword' | 'confirmPassword',
  ): boolean {
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
        next: () => {
          this.submitting.set(false);
          // Backend đã thu hồi refresh token → xoá phiên hiện tại.
          this.auth.logout();
          this.form.reset();
          this.success.set(
            'Mật khẩu đã được cập nhật. Vui lòng đăng nhập lại bằng mật khẩu mới.',
          );
        },
        error: (error: unknown) => {
          this.submitting.set(false);
          this.errors.set(getApiErrorMessages(error));
        },
      });
  }
}
