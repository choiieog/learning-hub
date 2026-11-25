import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  HostListener,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AvatarFrame, User } from '../../../core/models';
import { AuthService } from '../../../core/services/auth.service';
import { AvatarFrameService } from '../../../core/services/avatar-frame.service';
import { UploadService } from '../../../core/services/upload.service';
import { UserService } from '../../../core/services/user.service';
import { getApiErrorMessages } from '../../../core/utils/api-error.util';
import { initials } from '../../../core/utils/format.util';

const MAX_AVATAR_MB = 5;
const AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const BIO_MAX = 500;

/**
 * Hồ sơ cá nhân.
 *
 * - Sửa họ tên / mã sinh viên / giới thiệu → PATCH /api/users/me (server trả hồ sơ mới,
 *   UserService cập nhật luôn AuthService.currentUser để header đổi theo).
 * - Đổi avatar: upload ảnh (folder "avatars") → PATCH /api/users/me/avatar với url server trả.
 * - Khung avatar mở khoá theo cấp: GET /api/avatar-frames + PATCH /api/users/me/avatar-frame.
 * - Email dùng để đăng nhập nên chỉ hiển thị, không sửa ở đây.
 */
@Component({
  selector: 'app-profile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ReactiveFormsModule, DatePipe],
  templateUrl: './profile.html',
  styleUrl: './profile.css',
})
export class Profile implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly userService = inject(UserService);
  private readonly avatarFrameService = inject(AvatarFrameService);
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
  protected readonly frames = signal<AvatarFrame[]>([]);
  protected readonly currentFrameId = signal<string | null>(null);
  protected readonly savingFrame = signal(false);
  protected readonly frameError = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    fullName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(120)]],
    bio: ['', [Validators.maxLength(BIO_MAX)]],
  });

  protected readonly userInitials = computed(() => initials(this.user()?.fullName ?? ''));
  protected readonly currentFrameAsset = computed(() => {
    const frame = this.frames().find((item) => item.id === this.currentFrameId());

    return frame?.assetUrl ?? null;
  });
  protected readonly roleLabel = computed(() =>
    this.user()?.role === 'ADMIN' ? 'Quản trị viên' : 'Sinh viên',
  );
  protected readonly profilePath = this.auth.profilePath;

  /** Có thay đổi chưa lưu trong form hồ sơ → guard sẽ hỏi trước khi rời trang. */
  hasUnsavedChanges(): boolean {
    return this.form.dirty;
  }

  /** F5 / đóng tab: guard không chạy nên phải hỏi bằng beforeunload. */
  @HostListener('window:beforeunload', ['$event'])
  protected warnBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.hasUnsavedChanges()) {
      event.preventDefault();
    }
  }

  ngOnInit(): void {
    this.form.controls.bio.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => this.bioLength.set(value.length));

    this.fetch();
    this.loadFrames();
  }

  protected showError(control: 'fullName' | 'bio'): boolean {
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
      .updateProfile({ fullName: raw.fullName, bio: raw.bio })
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

  /** Chọn/bỏ khung; đổi xong cập nhật cả hồ sơ lẫn header. */
  protected selectFrame(frameId: string | null): void {
    this.savingFrame.set(true);
    this.frameError.set(null);
    this.success.set(null);

    this.avatarFrameService
      .select(frameId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (user) => {
          this.savingFrame.set(false);
          this.user.set(user);
          this.auth.setCurrentUser(user);
          this.currentFrameId.set(user.avatarFrameId ?? null);
          this.success.set(frameId ? 'Đã đổi khung avatar.' : 'Đã bỏ khung avatar.');
        },
        error: (error: unknown) => {
          this.savingFrame.set(false);
          this.frameError.set(getApiErrorMessages(error).join(' '));
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

  private loadFrames(): void {
    this.avatarFrameService
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          this.frames.set(data.items);
          this.currentFrameId.set(data.currentFrameId);
        },
        error: () => undefined,
      });
  }

  private fillForm(): void {
    const user = this.user();

    this.form.reset({
      fullName: user?.fullName ?? '',
      bio: user?.bio ?? '',
    });
    this.bioLength.set(user?.bio?.length ?? 0);
  }
}
