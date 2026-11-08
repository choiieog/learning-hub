import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { User } from '../../../../core/models';
import { AuthService } from '../../../../core/services/auth.service';
import { UploadService } from '../../../../core/services/upload.service';
import { UserService } from '../../../../core/services/user.service';
import { getApiErrorMessages } from '../../../../core/utils/api-error.util';
import { initials } from '../../../../core/utils/format.util';

const MAX_AVATAR_MB = 5;
const AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const BIO_MAX = 500;

/**
 * Hồ sơ cá nhân.
 *
 * - Sửa họ tên / mã sinh viên / giới thiệu → PATCH /api/users/me (server trả hồ sơ mới,
 *   UserService cập nhật luôn AuthService.currentUser để header đổi theo).
 * - Đổi avatar: upload ảnh (folder "avatars") → PATCH /api/users/me/avatar với url server trả.
 * - Email dùng để đăng nhập nên chỉ hiển thị, không sửa ở đây.
 */
@Component({
  selector: 'app-profile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ReactiveFormsModule, DatePipe],
  template: `
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Hồ sơ</h1>
        <p class="mt-1 text-sm text-slate-500">Thông tin hiển thị cùng tài liệu bạn chia sẻ.</p>
      </div>
      <a routerLink="/profile/password" class="btn-secondary w-auto">Đổi mật khẩu</a>
    </div>

    @if (loading()) {
      <div class="mt-6 grid gap-6 lg:grid-cols-3" aria-busy="true">
        <div class="animate-pulse rounded-xl border border-slate-200 bg-white p-6">
          <div class="mx-auto h-24 w-24 rounded-full bg-slate-200"></div>
          <div class="mx-auto mt-4 h-4 w-1/2 rounded bg-slate-100"></div>
          <div class="mx-auto mt-2 h-3 w-2/3 rounded bg-slate-100"></div>
        </div>
        <div class="animate-pulse rounded-xl border border-slate-200 bg-white p-6 lg:col-span-2">
          <div class="h-4 w-1/3 rounded bg-slate-200"></div>
          <div class="mt-4 space-y-4">
            @for (row of [1, 2, 3]; track row) {
              <div class="h-10 rounded bg-slate-100"></div>
            }
          </div>
        </div>
      </div>
    } @else {
      @if (success()) {
        <div class="alert alert-success mt-6" role="status">
          <p>{{ success() }}</p>
        </div>
      }

      @if (errors().length > 0) {
        <div class="alert alert-error mt-6" role="alert">
          @for (error of errors(); track error) {
            <p>{{ error }}</p>
          }
        </div>
      }

      <div class="mt-6 grid gap-6 lg:grid-cols-3">
        <!-- Thẻ định danh -->
        <section class="rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          @if (user()?.avatarUrl; as avatarUrl) {
            <img
              [src]="avatarUrl"
              [alt]="'Ảnh đại diện của ' + (user()?.fullName ?? '')"
              class="mx-auto h-24 w-24 rounded-full border border-slate-200 object-cover"
            />
          } @else {
            <div
              class="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-indigo-50 text-2xl font-semibold text-indigo-700"
              aria-hidden="true"
            >
              {{ userInitials() }}
            </div>
          }

          <h2 class="mt-4 text-lg font-semibold text-slate-900">{{ user()?.fullName }}</h2>
          <p class="mt-0.5 text-sm text-slate-500">{{ user()?.email }}</p>
          <p class="mt-2 inline-block rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">
            {{ roleLabel() }}
          </p>

          <div class="mt-5">
            <input
              #avatarInput
              type="file"
              class="hidden"
              accept="image/png,image/jpeg,image/webp"
              (change)="onAvatarSelected($event)"
            />
            <button
              type="button"
              class="btn-secondary w-full"
              [disabled]="uploadingAvatar()"
              (click)="avatarInput.click()"
            >
              {{ uploadingAvatar() ? 'Đang tải ảnh...' : 'Đổi ảnh đại diện' }}
            </button>
            <p class="mt-2 text-xs text-slate-400">PNG, JPG hoặc WEBP, tối đa {{ maxAvatarMb }} MB.</p>
            @if (avatarError()) {
              <p class="mt-2 text-sm text-rose-600" role="alert">{{ avatarError() }}</p>
            }
          </div>

          <dl class="mt-6 space-y-3 border-t border-slate-100 pt-4 text-left text-sm">
            <div class="flex justify-between gap-3">
              <dt class="text-slate-500">Mã sinh viên</dt>
              <dd class="font-medium text-slate-800">{{ user()?.studentCode || '—' }}</dd>
            </div>
            <div class="flex justify-between gap-3">
              <dt class="text-slate-500">Cấp độ</dt>
              <dd class="font-medium text-slate-800">Cấp {{ user()?.level ?? 1 }}</dd>
            </div>
            <div class="flex justify-between gap-3">
              <dt class="text-slate-500">Tham gia</dt>
              <dd class="font-medium text-slate-800">
                {{ user()?.createdAt | date: 'dd/MM/yyyy' }}
              </dd>
            </div>
          </dl>
        </section>

        <!-- Form thông tin -->
        <section class="rounded-xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
          <h2 class="text-base font-semibold">Thông tin cá nhân</h2>
          <p class="mt-1 text-sm text-slate-500">
            Email đăng nhập không đổi được tại đây — liên hệ admin nếu cần.
          </p>

          <form class="mt-5" [formGroup]="form" (ngSubmit)="save()" novalidate>
            <div class="field">
              <label class="field-label" for="fullName">Họ và tên</label>
              <input
                id="fullName"
                class="field-input"
                type="text"
                formControlName="fullName"
                autocomplete="name"
                maxlength="120"
                [attr.aria-invalid]="showError('fullName')"
              />
              @if (showError('fullName')) {
                <p class="field-error">Họ tên phải có ít nhất 2 ký tự.</p>
              }
            </div>

            <div class="field">
              <label class="field-label" for="studentCode">Mã sinh viên</label>
              <input
                id="studentCode"
                class="field-input"
                type="text"
                formControlName="studentCode"
                placeholder="VD: 20210001"
                maxlength="20"
                [attr.aria-invalid]="showError('studentCode')"
              />
              @if (showError('studentCode')) {
                <p class="field-error">
                  Mã sinh viên 3–20 ký tự, chỉ gồm chữ, số và . _ -
                </p>
              }
            </div>

            <div class="field">
              <label class="field-label" for="bio">Giới thiệu</label>
              <textarea
                id="bio"
                class="field-input min-h-28"
                formControlName="bio"
                rows="4"
                [attr.maxlength]="bioMax"
                placeholder="Vài dòng về ngành học, môn bạn quan tâm..."
                [attr.aria-invalid]="showError('bio')"
              ></textarea>
              <p class="mt-1 text-right text-xs text-slate-400">
                {{ bioLength() }}/{{ bioMax }}
                @if (showError('bio')) {
                  <span class="text-rose-600">— tối đa {{ bioMax }} ký tự</span>
                }
              </p>
            </div>

            <div class="mt-6 flex flex-wrap items-center gap-3">
              <button class="btn-primary w-auto" type="submit" [disabled]="saving()">
                {{ saving() ? 'Đang lưu...' : 'Lưu thay đổi' }}
              </button>
              <button
                type="button"
                class="btn-secondary w-auto"
                [disabled]="saving()"
                (click)="reset()"
              >
                Hoàn tác
              </button>
            </div>
          </form>
        </section>
      </div>
    }
  `,
})
export class Profile implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly userService = inject(UserService);
  private readonly uploadService = inject(UploadService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly maxAvatarMb = MAX_AVATAR_MB;
  protected readonly bioMax = BIO_MAX;

  protected readonly user = signal<User | null>(null);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly uploadingAvatar = signal(false);
  protected readonly success = signal<string | null>(null);
  protected readonly errors = signal<string[]>([]);
  protected readonly avatarError = signal<string | null>(null);
  protected readonly bioLength = signal(0);

  protected readonly form = this.fb.nonNullable.group({
    fullName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(120)]],
    studentCode: ['', [Validators.pattern(/^$|^[A-Za-z0-9._-]{3,20}$/)]],
    bio: ['', [Validators.maxLength(BIO_MAX)]],
  });

  protected readonly userInitials = computed(() => initials(this.user()?.fullName ?? ''));
  protected readonly roleLabel = computed(() =>
    this.user()?.role === 'ADMIN' ? 'Quản trị viên' : 'Sinh viên',
  );

  ngOnInit(): void {
    this.form.controls.bio.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => this.bioLength.set(value.length));

    this.fetch();
  }

  protected showError(control: 'fullName' | 'studentCode' | 'bio'): boolean {
    const field = this.form.controls[control];
    return field.touched && field.invalid;
  }

  protected reset(): void {
    this.fillForm();
    this.errors.set([]);
    this.success.set(null);
  }

  protected save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.errors.set([]);
    this.success.set(null);

    const raw = this.form.getRawValue();

    this.userService
      .updateProfile({ fullName: raw.fullName, studentCode: raw.studentCode, bio: raw.bio })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (user) => {
          this.saving.set(false);
          this.user.set(user);
          this.fillForm();
          this.success.set('Đã lưu hồ sơ.');
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.errors.set(getApiErrorMessages(error));
        },
      });
  }

  protected onAvatarSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    this.avatarError.set(null);

    if (!file) {
      return;
    }

    if (!AVATAR_TYPES.includes(file.type)) {
      this.avatarError.set('Chỉ nhận ảnh PNG, JPG hoặc WEBP.');
      input.value = '';
      return;
    }

    if (file.size > MAX_AVATAR_MB * 1024 * 1024) {
      this.avatarError.set(`Ảnh tối đa ${MAX_AVATAR_MB} MB.`);
      input.value = '';
      return;
    }

    this.uploadingAvatar.set(true);
    this.success.set(null);
    this.errors.set([]);

    this.uploadService
      .upload(file, 'avatars')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (stored) => {
          this.userService
            .updateAvatar(stored.url)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
              next: (user) => {
                this.uploadingAvatar.set(false);
                this.user.set(user);
                this.success.set('Đã cập nhật ảnh đại diện.');
                input.value = '';
              },
              error: (error: unknown) => {
                this.uploadingAvatar.set(false);
                this.avatarError.set(getApiErrorMessages(error).join(' '));
                input.value = '';
              },
            });
        },
        error: (error: unknown) => {
          this.uploadingAvatar.set(false);
          this.avatarError.set(getApiErrorMessages(error).join(' '));
          input.value = '';
        },
      });
  }

  private fetch(): void {
    this.loading.set(true);
    this.errors.set([]);

    this.userService
      .getMe()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (user) => {
          this.user.set(user);
          // Đồng bộ lại header nếu hồ sơ đã đổi ở thiết bị khác.
          this.auth.setCurrentUser(user);
          this.fillForm();
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.errors.set(getApiErrorMessages(error));
          this.loading.set(false);
        },
      });
  }

  private fillForm(): void {
    const user = this.user();

    this.form.reset({
      fullName: user?.fullName ?? '',
      studentCode: user?.studentCode ?? '',
      bio: user?.bio ?? '',
    });
    this.bioLength.set(user?.bio?.length ?? 0);
  }
}
