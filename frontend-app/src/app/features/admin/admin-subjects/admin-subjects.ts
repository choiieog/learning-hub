import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subject } from '../../../core/models';
import { AdminService } from '../../../core/services/admin.service';
import { getApiErrorMessages } from '../../../core/utils/api-error.util';

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
  templateUrl: './admin-subjects.html',
  styleUrl: './admin-subjects.css',
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
      .createSubject({ code: raw.code, name: raw.name })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (subject) => {
          this.saving.set(false);
          this.success.set(`Đã thêm môn ${subject.code} — ${subject.name}.`);
          this.form.reset({ code: '', name: '' });
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
          this.success.set(`Đã xoá môn ${target.code} khỏi cơ sở dữ liệu.`);
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
