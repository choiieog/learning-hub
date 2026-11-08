import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subject } from '../../../../core/models';
import { AdminService } from '../../../../core/services/admin.service';
import { getApiErrorMessages } from '../../../../core/utils/api-error.util';

/**
 * Danh mục môn học (admin).
 *
 * Bảng môn + số tài liệu đã duyệt; thêm môn qua form (mã được chuẩn hoá chữ hoa ở backend);
 * xoá là xoá mềm và bị chặn khi môn còn tài liệu — backend trả 409 kèm số tài liệu,
 * UI cũng chặn nút xoá trước khi gọi.
 */
@Component({
  selector: 'app-admin-subjects',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  template: `
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Danh mục môn học</h1>
        <p class="mt-1 text-sm text-slate-500">
          Mỗi tài liệu thuộc đúng một môn; không xoá được môn còn tài liệu.
        </p>
      </div>
      <button type="button" class="btn-primary w-auto" (click)="toggleForm()">
        {{ showForm() ? 'Đóng form' : 'Thêm môn học' }}
      </button>
    </div>

    @if (success()) {
      <div class="alert alert-success mt-5" role="status">
        <p>{{ success() }}</p>
      </div>
    }

    @if (errors().length > 0) {
      <div class="alert alert-error mt-5" role="alert">
        @for (error of errors(); track error) {
          <p>{{ error }}</p>
        }
      </div>
    }

    @if (showForm()) {
      <section class="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 class="text-base font-semibold">Thêm môn học</h2>

        <form
          class="mt-4 grid max-w-3xl gap-4 sm:grid-cols-2"
          [formGroup]="form"
          (ngSubmit)="create()"
          novalidate
        >
          <div class="field">
            <label class="field-label" for="code">Mã môn</label>
            <input
              id="code"
              class="field-input"
              type="text"
              formControlName="code"
              placeholder="VD: INT2204"
              maxlength="20"
              [attr.aria-invalid]="showError('code')"
            />
            @if (showError('code')) {
              <p class="field-error">Mã môn 2–20 ký tự, chỉ gồm chữ và số.</p>
            }
          </div>

          <div class="field">
            <label class="field-label" for="name">Tên môn học</label>
            <input
              id="name"
              class="field-input"
              type="text"
              formControlName="name"
              placeholder="VD: Lập trình hướng đối tượng"
              maxlength="120"
              [attr.aria-invalid]="showError('name')"
            />
            @if (showError('name')) {
              <p class="field-error">Tên môn phải có ít nhất 3 ký tự.</p>
            }
          </div>

          <div class="field sm:col-span-2">
            <label class="field-label" for="description">Mô tả (không bắt buộc)</label>
            <textarea
              id="description"
              class="field-input"
              formControlName="description"
              rows="2"
              maxlength="500"
              placeholder="Vài dòng giới thiệu nội dung môn học"
            ></textarea>
          </div>

          <div class="sm:col-span-2">
            <button class="btn-primary w-auto" type="submit" [disabled]="saving()">
              {{ saving() ? 'Đang thêm...' : 'Thêm môn học' }}
            </button>
          </div>
        </form>
      </section>
    }

    @if (loading()) {
      <div class="mt-6 space-y-2" aria-busy="true">
        @for (placeholder of [1, 2, 3, 4]; track placeholder) {
          <div class="h-14 animate-pulse rounded-lg bg-white"></div>
        }
      </div>
    } @else if (subjects().length === 0) {
      <div class="mt-8 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
        <p class="text-sm font-medium text-slate-700">Chưa có môn học nào</p>
        <p class="mt-1 text-sm text-slate-500">Thêm môn đầu tiên để sinh viên chọn khi đăng tài liệu.</p>
      </div>
    } @else {
      <div class="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div
          class="hidden grid-cols-12 gap-3 border-b border-slate-100 bg-slate-50 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 md:grid"
        >
          <span class="col-span-2">Mã môn</span>
          <span class="col-span-4">Tên môn</span>
          <span class="col-span-3">Mô tả</span>
          <span class="col-span-2 text-right">Tài liệu</span>
          <span class="col-span-1 text-right">Xoá</span>
        </div>

        @for (subject of subjects(); track subject.id) {
          <div
            class="grid grid-cols-1 gap-2 border-b border-slate-100 px-5 py-3.5 last:border-b-0 md:grid-cols-12 md:items-center md:gap-3"
          >
            <p class="font-mono text-sm font-semibold text-indigo-700 md:col-span-2">
              {{ subject.code }}
            </p>
            <p class="text-sm font-medium text-slate-900 md:col-span-4">{{ subject.name }}</p>
            <p class="line-clamp-2 text-sm text-slate-500 md:col-span-3">
              {{ subject.description || '—' }}
            </p>
            <p class="text-sm text-slate-600 md:col-span-2 md:text-right">
              {{ subject.documentCount }} tài liệu
            </p>
            <div class="md:col-span-1 md:text-right">
              <button
                type="button"
                class="rounded-md px-2 py-1 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent"
                [disabled]="subject.documentCount > 0"
                [attr.title]="
                  subject.documentCount > 0 ? 'Không xoá được: môn còn tài liệu' : 'Xoá môn học'
                "
                (click)="askDelete(subject)"
              >
                Xoá
              </button>
            </div>
          </div>
        }
      </div>
    }

    @if (deleteTarget(); as target) {
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
        <div class="w-full max-w-md rounded-xl bg-white p-6 shadow-xl" role="dialog" aria-modal="true">
          <h2 class="text-lg font-semibold">Xoá môn {{ target.code }}?</h2>
          <p class="mt-2 text-sm text-slate-600">
            Môn “{{ target.name }}” sẽ bị ẩn khỏi danh mục. Hành động này không xoá tài liệu.
          </p>

          @if (deleteError()) {
            <p class="mt-3 text-sm text-rose-600" role="alert">{{ deleteError() }}</p>
          }

          <div class="mt-5 flex flex-wrap justify-end gap-3">
            <button
              type="button"
              class="btn-secondary w-auto"
              [disabled]="deleting()"
              (click)="cancelDelete()"
            >
              Huỷ
            </button>
            <button
              type="button"
              class="w-auto rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:opacity-60"
              [disabled]="deleting()"
              (click)="confirmDelete(target)"
            >
              {{ deleting() ? 'Đang xoá...' : 'Xoá môn học' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class AdminSubjects implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly adminService = inject(AdminService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly errors = signal<string[]>([]);
  protected readonly success = signal<string | null>(null);
  protected readonly subjects = signal<Subject[]>([]);
  protected readonly showForm = signal(false);
  protected readonly deleteTarget = signal<Subject | null>(null);
  protected readonly deleting = signal(false);
  protected readonly deleteError = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    code: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(20), Validators.pattern(/^[A-Za-z0-9]+$/)]],
    name: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(120)]],
    description: ['', [Validators.maxLength(500)]],
  });

  ngOnInit(): void {
    this.fetch();
  }

  protected showError(control: 'code' | 'name'): boolean {
    const field = this.form.controls[control];
    return field.touched && field.invalid;
  }

  protected toggleForm(): void {
    this.showForm.update((open) => !open);
    this.errors.set([]);
    this.success.set(null);
  }

  protected create(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.errors.set([]);
    this.success.set(null);

    const raw = this.form.getRawValue();

    this.adminService
      .createSubject({
        code: raw.code,
        name: raw.name,
        description: raw.description.trim() ? raw.description : undefined,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (subject) => {
          this.saving.set(false);
          this.success.set(`Đã thêm môn ${subject.code} — ${subject.name}.`);
          this.form.reset({ code: '', name: '', description: '' });
          this.showForm.set(false);
          this.fetch();
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.errors.set(getApiErrorMessages(error));
        },
      });
  }

  protected askDelete(subject: Subject): void {
    if (subject.documentCount > 0) {
      return;
    }

    this.deleteError.set(null);
    this.deleteTarget.set(subject);
  }

  protected cancelDelete(): void {
    this.deleteTarget.set(null);
    this.deleteError.set(null);
  }

  protected confirmDelete(target: Subject): void {
    this.deleting.set(true);
    this.deleteError.set(null);

    this.adminService
      .removeSubject(target.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.deleting.set(false);
          this.deleteTarget.set(null);
          this.success.set(`Đã xoá môn ${target.code}.`);
          this.fetch();
        },
        error: (error: unknown) => {
          this.deleting.set(false);
          this.deleteError.set(getApiErrorMessages(error).join(' '));
        },
      });
  }

  private fetch(): void {
    this.loading.set(true);

    this.adminService
      .subjects()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (subjects) => {
          this.subjects.set(subjects);
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.errors.set(getApiErrorMessages(error));
          this.loading.set(false);
        },
      });
  }
}
