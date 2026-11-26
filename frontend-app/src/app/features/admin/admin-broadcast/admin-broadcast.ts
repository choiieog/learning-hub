import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AppNotification } from '../../../core/models';
import { AdminService } from '../../../core/services/admin.service';
import { getApiErrorMessages } from '../../../core/utils/api-error.util';

/**
 * Gửi thông báo hàng loạt (admin).
 *
 * Backend lưu một row `Notification.userId = null` (`POST /api/admin/notifications/broadcast`),
 * nên mọi sinh viên thấy cùng một tin trong chuông và trang `/notifications`.
 * Không sửa được sau khi gửi; gửi nhầm thì thu hồi ở danh sách "Đã gửi gần đây" (xoá hẳn
 * row dùng chung, `NotificationRead` của mọi người bị dọn theo cascade).
 */
@Component({
  selector: 'app-admin-broadcast',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, DatePipe],
  templateUrl: './admin-broadcast.html',
  styleUrl: './admin-broadcast.css',
})
export class AdminBroadcast {
  private readonly fb = inject(FormBuilder);
  private readonly adminApi = inject(AdminService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly submitting = signal(false);
  protected readonly sent = signal<string | null>(null);
  protected readonly errors = signal<string[]>([]);
  protected readonly sentItems = signal<AppNotification[]>([]);
  protected readonly loadingSent = signal(true);

  constructor() {
    this.loadSent();
  }

  private loadSent(): void {
    this.loadingSent.set(true);

    this.adminApi
      .broadcastNotifications()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          this.sentItems.set(page.items);
          this.loadingSent.set(false);
        },
        error: () => this.loadingSent.set(false),
      });
  }

  /** Thu hồi thông báo chung: xoá hẳn nên cần xác nhận trước. */
  protected revoke(item: AppNotification): void {
    if (!confirm(`Thu hồi “${item.title}” khỏi chuông của mọi sinh viên?`)) {
      return;
    }

    this.errors.set([]);

    this.adminApi
      .removeBroadcastNotification(item.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () =>
          this.sentItems.update((list) => list.filter((sent) => sent.id !== item.id)),
        error: (error: unknown) => this.errors.set(getApiErrorMessages(error)),
      });
  }

  protected readonly form = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.minLength(5), Validators.maxLength(120)]],
    message: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(1000)]],
  });

  protected readonly titleLength = computed(() => this.form.controls.title.value.length);
  protected readonly messageLength = computed(() => this.form.controls.message.value.length);

  protected showError(control: 'title' | 'message'): boolean {
    const field = this.form.controls[control];

    return field.touched && field.invalid;
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.errors.set([]);

    const { title, message } = this.form.getRawValue();

    this.adminApi
      .broadcastNotification({ title: title.trim(), message: message.trim() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (notification) => {
          this.submitting.set(false);
          this.sent.set(notification.title);
          this.form.reset();
          this.loadSent();
        },
        error: (error: unknown) => {
          this.submitting.set(false);
          this.errors.set(getApiErrorMessages(error));
        },
      });
  }
}
