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

interface DashboardStat {
  label: string;
  value: number;
  hint: string;
  link: string;
  tone?: 'warning';
}

interface DocumentHealth {
  total: number;
  approved: number;
  pending: number;
  approvedPercent: number;
  pendingPercent: number;
  approvalRate: number;
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

  protected readonly stats = computed<DashboardStat[]>(() => {
    const data = this.overview();
    if (!data) {
      return [];
    }

    return [
      {
        label: 'Người dùng',
        value: data.users.total,
        hint: `+${data.users.newIn7Days} trong 7 ngày`,
        link: '/admin/users',
      },
      {
        label: 'Tài liệu',
        value: data.documents.total,
        hint: `${data.documents.approved} tài liệu đã duyệt`,
        link: '/admin/documents',
      },
      {
        label: 'Chờ duyệt',
        value: data.documents.pending,
        hint: data.documents.pending > 0 ? 'Cần xử lý để hiển thị công khai' : 'Hàng chờ đang trống',
        link: '/admin/documents',
        tone: 'warning',
      },
      {
        label: 'Lượt xem',
        value: data.views.total,
        hint: `${data.views.in7Days} lượt trong 7 ngày`,
        link: '/admin/documents',
      },
    ];
  });

  /** Tỉ lệ duyệt thật của toàn thư viện, dùng cho gauge. */
  protected readonly documentHealth = computed<DocumentHealth>(() => {
    const data = this.overview();
    const total = data?.documents.total ?? 0;
    const approved = data?.documents.approved ?? 0;
    const pending = data?.documents.pending ?? 0;

    return {
      total,
      approved,
      pending,
      approvedPercent: total > 0 ? (approved / total) * 100 : 0,
      pendingPercent: total > 0 ? (pending / total) * 100 : 0,
      approvalRate: total > 0 ? Math.round((approved / total) * 100) : 0,
    };
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
