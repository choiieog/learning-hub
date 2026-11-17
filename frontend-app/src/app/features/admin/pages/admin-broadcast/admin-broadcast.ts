import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AppNotification } from '../../../../core/models';
import { AdminService } from '../../../../core/services/admin.service';
import { getApiErrorMessages } from '../../../../core/utils/api-error.util';

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
  imports: [ReactiveFormsModule, RouterLink, DatePipe],
  template: `
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Thông báo hàng loạt</h1>
        <p class="mt-1 text-sm text-slate-500">
          Gửi một thông báo chung tới tất cả sinh viên — hiện trong chuông và trang thông báo.
        </p>
      </div>
      <a routerLink="/admin/dashboard" class="btn-secondary w-auto">Về tổng quan</a>
    </div>

    @if (sent()) {
      <div class="alert alert-success mt-6" role="status">
        <p class="font-medium">Đã gửi thông báo</p>
        <p class="mt-1">“{{ sent() }}” đã xuất hiện trong thông báo của mọi sinh viên.</p>
        <a routerLink="/notifications" class="btn-primary mt-3 w-auto">Xem trang thông báo</a>
      </div>
    }

    @if (errors().length > 0) {
      <div class="alert alert-error mt-6" role="alert">
        @for (error of errors(); track error) {
          <p>{{ error }}</p>
        }
      </div>
    }

    <form
      class="mt-6 max-w-3xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      [formGroup]="form"
      (ngSubmit)="submit()"
      novalidate
    >
      <div class="field">
        <label class="field-label" for="title">Tiêu đề</label>
        <input
          id="title"
          class="field-input"
          type="text"
          formControlName="title"
          maxlength="120"
          placeholder="VD: Bảo trì hệ thống tối nay"
          [attr.aria-invalid]="showError('title')"
        />
        <p class="mt-1 text-right text-xs text-slate-400">
          {{ titleLength() }}/120 ký tự
        </p>
        @if (showError('title')) {
          <p class="field-error">Tiêu đề 5–120 ký tự.</p>
        }
      </div>

      <div class="field">
        <label class="field-label" for="message">Nội dung</label>
        <textarea
          id="message"
          class="field-input min-h-32"
          rows="6"
          formControlName="message"
          maxlength="1000"
          placeholder="VD: Hệ thống bảo trì từ 22:00 đến 23:00 ngày 10/11. Trong thời gian này bạn không đăng nhập được."
          [attr.aria-invalid]="showError('message')"
        ></textarea>
        <p class="mt-1 text-right text-xs text-slate-400">
          {{ messageLength() }}/1000 ký tự
        </p>
        @if (showError('message')) {
          <p class="field-error">Nội dung 10–1000 ký tự.</p>
        }
      </div>

      <div class="mt-2 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
        Thông báo gửi đi không sửa được. Chỉ dùng cho thông tin chung, không dùng để nhắc riêng một
        tài khoản (dùng “Quản lý tài khoản” → gửi cảnh báo). Gửi nhầm thì thu hồi ở danh sách bên dưới.
      </div>

      <button class="btn-primary mt-6" type="submit" [disabled]="submitting()">
        {{ submitting() ? 'Đang gửi...' : 'Gửi tới tất cả sinh viên' }}
      </button>
    </form>

    <section class="mt-10 max-w-3xl">
      <h2 class="text-lg font-semibold tracking-tight">Đã gửi gần đây</h2>
      <p class="mt-1 text-sm text-slate-500">
        Thu hồi thông báo gửi nhầm — tin biến mất khỏi chuông của mọi sinh viên.
      </p>

      @if (loadingSent()) {
        <p class="mt-4 text-sm text-slate-500" aria-busy="true">Đang tải...</p>
      } @else if (sentItems().length === 0) {
        <p
          class="mt-4 rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500"
        >
          Chưa gửi thông báo chung nào.
        </p>
      } @else {
        <ul class="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          @for (item of sentItems(); track item.id) {
            <li class="flex items-start gap-3 px-4 py-3">
              <div class="min-w-0 flex-1">
                <p class="text-sm font-semibold text-slate-900">{{ item.title }}</p>
                <p class="mt-1 text-sm text-slate-600">{{ item.message }}</p>
                <p class="mt-1 text-xs text-slate-400">
                  {{ item.createdAt | date: 'dd/MM/yyyy HH:mm' }}
                </p>
              </div>
              <button
                type="button"
                class="shrink-0 self-center rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-500 transition hover:border-rose-300 hover:text-rose-600"
                [attr.aria-label]="'Thu hồi thông báo: ' + item.title"
                (click)="revoke(item)"
              >
                Thu hồi
              </button>
            </li>
          }
        </ul>
      }
    </section>
  `,
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
