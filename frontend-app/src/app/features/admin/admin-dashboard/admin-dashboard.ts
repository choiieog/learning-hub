import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { AdminOverview } from '../../../core/models';
import { AdminService } from '../../../core/services/admin.service';
import { getApiErrorMessages } from '../../../core/utils/api-error.util';

/**
 * Tổng quan quản trị.
 *
 * Một request `GET /api/admin/dashboard/overview`: đếm người dùng (tổng, mới 7 ngày,
 * bị cảnh báo, bị khoá), đếm tài liệu theo trạng thái, tổng lượt xem + 7 ngày,
 * top 5 tài liệu nhiều view và 10 hoạt động gần đây (bài đăng mới + cảnh báo).
 * Lối tắt sang hàng chờ duyệt nằm ngay trên header.
 */
@Component({
  selector: 'app-admin-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DatePipe],
  templateUrl: './admin-dashboard.html',
  styleUrl: './admin-dashboard.css',
})
export class AdminDashboard implements OnInit {
  private readonly adminService = inject(AdminService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly loading = signal(true);
  protected readonly errors = signal<string[]>([]);
  protected readonly overview = signal<AdminOverview | null>(null);

  ngOnInit(): void {
    this.fetch();
  }

  protected activityBadgeClass(type: 'DOCUMENT' | 'WARNING'): string {
    return type === 'WARNING'
      ? 'status-pill status-pending'
      : 'status-pill border-line bg-wash text-ink-soft';
  }

  private fetch(): void {
    this.loading.set(true);
    this.errors.set([]);

    this.adminService
      .overview()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          this.overview.set(data);
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.errors.set(getApiErrorMessages(error));
          this.loading.set(false);
        },
      });
  }
}
