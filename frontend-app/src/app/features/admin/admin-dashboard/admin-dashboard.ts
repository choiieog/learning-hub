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
import { RouterLink } from '@angular/router';
import { AdminOverview } from '../../../core/models';
import { AdminService } from '../../../core/services/admin.service';
import { getApiErrorMessages } from '../../../core/utils/api-error.util';

type HealthTone = 'success' | 'warning' | 'danger';

interface HealthRow {
  label: string;
  value: number;
  percent: number;
  tone: HealthTone;
  note: string;
}

/**
 * Tổng quan quản trị.
 *
 * Một request `GET /api/admin/dashboard/overview`: đếm người dùng (tổng, mới 7 ngày,
 * bị cảnh báo, bị khoá), đếm tài liệu theo trạng thái, tổng lượt xem + 7 ngày,
 * top 5 tài liệu nhiều view và 10 hoạt động gần đây (bài đăng mới + cảnh báo).
 * Lối tắt sang hàng chờ duyệt nằm ngay trên dải KPI.
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

  /** Tỉ lệ sức khoẻ thư viện — tính từ số đếm thật, không phải mẫu số cố định. */
  protected readonly health = computed<HealthRow[]>(() => {
    const data = this.overview();
    if (!data) {
      return [];
    }

    const share = (value: number, total: number): number =>
      total > 0 ? Math.round((value / total) * 100) : 0;

    return [
      {
        label: 'Tài liệu đã duyệt',
        value: data.documents.approved,
        percent: share(data.documents.approved, data.documents.total),
        tone: 'success',
        note: `${data.documents.total} tài liệu trong thư viện`,
      },
      {
        label: 'Đang chờ duyệt',
        value: data.documents.pending,
        percent: share(data.documents.pending, data.documents.total),
        tone: 'warning',
        note: 'Cần xử lý để hiển thị công khai',
      },
      {
        label: 'Tài khoản bị cảnh báo',
        value: data.users.warned,
        percent: share(data.users.warned, data.users.total),
        tone: 'danger',
        note: `${data.users.total} tài khoản`,
      },
      {
        label: 'Tài khoản bị khoá',
        value: data.users.banned,
        percent: share(data.users.banned, data.users.total),
        tone: 'danger',
        note: `${data.users.newIn7Days} tài khoản mới trong 7 ngày`,
      },
    ];
  });

  private readonly maxViews = computed(() => {
    const documents = this.overview()?.topDocuments ?? [];
    return Math.max(1, ...documents.map((document) => document.viewCount));
  });

  ngOnInit(): void {
    this.fetch();
  }

  protected shareOfViews(viewCount: number): number {
    return Math.round((viewCount / this.maxViews()) * 100);
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
