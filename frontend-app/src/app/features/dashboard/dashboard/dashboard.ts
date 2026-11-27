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
import { DocumentStatus, DashboardOverview } from '../../../core/models';
import { AuthService } from '../../../core/services/auth.service';
import { DashboardService } from '../../../core/services/dashboard.service';
import { getApiErrorMessages } from '../../../core/utils/api-error.util';
import { DOCUMENT_STATUS_LABEL } from '../../../core/utils/document-status.util';
import { fileExtension } from '../../../core/utils/format.util';

interface Kpi {
  label: string;
  value: number;
  hint: string;
  link: string;
  queryParams?: Record<string, string>;
  tone?: 'warning';
}

interface TrendBar {
  key: string;
  label: string;
  dateLabel: string;
  count: number;
  height: number;
  peak: boolean;
}

interface TrendChart {
  bars: TrendBar[];
  empty: boolean;
}

interface LibraryHealth {
  total: number;
  approved: number;
  pending: number;
  approvedPercent: number;
  pendingPercent: number;
  approvalRate: number;
}

const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

/**
 * Trang tổng quan sinh viên.
 *
 * Một request `GET /api/dashboard/overview` trả đủ: số tài liệu theo trạng thái,
 * tổng lượt xem + lượt xem 7 ngày (kèm biểu đồ vùng), 5 tài liệu gần đây của tôi
 * và 5 tài liệu nhiều lượt xem nhất.
 */
@Component({
  selector: 'app-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DatePipe],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard implements OnInit {
  private readonly dashboardService = inject(DashboardService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly loading = signal(true);
  protected readonly errors = signal<string[]>([]);
  protected readonly overview = signal<DashboardOverview | null>(null);

  /**
   * Tên gọi trên lời chào: tên riêng (từ cuối trong họ tên kiểu Việt Nam) với sinh viên,
   * còn tài khoản admin dùng họ tên đầy đủ vì tên của họ là chức danh ("Quản trị viên").
   */
  protected readonly greetingName = computed(() => {
    const user = this.auth.currentUser();
    const fullName = user?.fullName?.trim() ?? '';
    if (!fullName) {
      return 'bạn';
    }

    if (user?.role === 'ADMIN') {
      return fullName;
    }

    return fullName.split(/\s+/).filter(Boolean).slice(-1)[0];
  });

  protected readonly kpis = computed<Kpi[]>(() => {
    const stats = this.overview()?.stats;
    return [
      {
        label: 'Tổng tài liệu',
        value: stats?.totalDocuments ?? 0,
        hint: `${stats?.approved ?? 0} đã duyệt · ${stats?.pending ?? 0} chờ duyệt`,
        link: '/my-documents',
      },
      {
        label: 'Đã duyệt',
        value: stats?.approved ?? 0,
        hint: 'Đang hiển thị công khai',
        link: '/my-documents',
        queryParams: { status: 'APPROVED' },
      },
      {
        label: 'Chờ duyệt',
        value: stats?.pending ?? 0,
        hint: 'Cần admin xử lý',
        link: '/my-documents',
        queryParams: { status: 'PENDING' },
        tone: 'warning',
      },
      {
        label: 'Lượt xem',
        value: stats?.totalViews ?? 0,
        hint: `${stats?.viewsLast7Days ?? 0} lượt trong 7 ngày`,
        link: '/documents',
      },
    ];
  });

  /** Chart chỉ vẽ từ dữ liệu thật của 7 ngày; không có mẫu số bịa. */
  protected readonly chart = computed<TrendChart>(() => {
    const trend = this.overview()?.viewTrend ?? [];
    const counts = trend.map((point) => point.count);
    const max = Math.max(1, ...counts);
    const empty = counts.every((count) => count === 0);

    return {
      empty,
      bars: trend.map((point) => {
        const date = new Date(`${point.day}T00:00:00`);
        const dateLabel = Number.isNaN(date.getTime())
          ? point.day.slice(5)
          : `${point.day.slice(8, 10)}/${point.day.slice(5, 7)}`;

        return {
          key: point.day,
          label: Number.isNaN(date.getTime()) ? '—' : (WEEKDAYS[date.getDay()] ?? '—'),
          dateLabel,
          count: point.count,
          height: empty ? 0 : Math.max(4, Math.round((point.count / max) * 100)),
          peak: !empty && point.count === max,
        };
      }),
    };
  });

  /** Tỉ lệ duyệt thật của thư viện cá nhân, dùng cho gauge. */
  protected readonly health = computed<LibraryHealth>(() => {
    const stats = this.overview()?.stats;
    const total = stats?.totalDocuments ?? 0;
    const approved = stats?.approved ?? 0;
    const pending = stats?.pending ?? 0;

    return {
      total,
      approved,
      pending,
      approvedPercent: total > 0 ? (approved / total) * 100 : 0,
      pendingPercent: total > 0 ? (pending / total) * 100 : 0,
      approvalRate: total > 0 ? Math.round((approved / total) * 100) : 0,
    };
  });

  /** Tỉ lệ thanh xếp hạng so với tài liệu nhiều lượt xem nhất trong danh sách. */
  protected readonly topShare = computed(() => {
    const documents = this.overview()?.topDocuments ?? [];
    const max = Math.max(1, ...documents.map((document) => document.viewCount));
    return max;
  });

  ngOnInit(): void {
    this.fetch();
  }

  protected statusLabel(status: DocumentStatus): string {
    return DOCUMENT_STATUS_LABEL[status];
  }

  protected badgeClass(status: DocumentStatus): string {
    return status === 'APPROVED'
      ? 'status-pill status-approved'
      : 'status-pill status-pending';
  }

  protected shareOfViews(viewCount: number): number {
    return Math.round((viewCount / this.topShare()) * 100);
  }

  protected fileType(name: string): string {
    return fileExtension(name);
  }

  private fetch(): void {
    this.loading.set(true);
    this.errors.set([]);

    this.dashboardService
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
