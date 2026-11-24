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
  link?: string;
  queryParams?: Record<string, string>;
}

interface TrendPoint {
  x: number;
  y: number;
  label: string;
  count: number;
}

interface TrendChart {
  line: string;
  area: string;
  points: TrendPoint[];
  ticks: { y: number; label: string }[];
  empty: boolean;
}

/* Khung vẽ của chart: rộng 1000, cao 260, chừa 44px trục Y và 28px nhãn ngày. */
const CHART_WIDTH = 1000;
const CHART_HEIGHT = 260;
const CHART_LEFT = 44;
const CHART_RIGHT = 16;
const CHART_TOP = 12;
const CHART_BOTTOM = 28;

/** Nối các điểm bằng đường cong Catmull-Rom đổi sang Bezier để chart mềm như mẫu. */
function smoothPath(points: TrendPoint[]): string {
  if (points.length === 0) {
    return '';
  }

  if (points.length < 3) {
    return points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x} ${point.y}`).join(' ');
  }

  let path = `M${points[0].x} ${points[0].y}`;

  for (let index = 0; index < points.length - 1; index += 1) {
    const before = points[index - 1] ?? points[index];
    const current = points[index];
    const next = points[index + 1];
    const after = points[index + 2] ?? next;
    const c1x = current.x + (next.x - before.x) / 6;
    const c1y = current.y + (next.y - before.y) / 6;
    const c2x = next.x - (after.x - current.x) / 6;
    const c2y = next.y - (after.y - current.y) / 6;

    path += ` C${c1x} ${c1y}, ${c2x} ${c2y}, ${next.x} ${next.y}`;
  }

  return path;
}

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
        hint: 'Xem tài liệu đã chia sẻ',
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
        hint: 'Chờ admin xử lý',
        link: '/my-documents',
        queryParams: { status: 'PENDING' },
      },
      {
        label: 'Lượt xem',
        value: stats?.totalViews ?? 0,
        hint: `${stats?.viewsLast7Days ?? 0} lượt trong 7 ngày`,
      },
    ];
  });

  /** Chart chỉ vẽ từ dữ liệu thật của 7 ngày; không có mẫu số bịa. */
  protected readonly chart = computed<TrendChart>(() => {
    const trend = this.overview()?.viewTrend ?? [];
    const counts = trend.map((point) => point.count);
    const step = Math.max(1, Math.ceil(Math.max(1, ...counts) / 4));
    const max = step * 4;
    const innerWidth = CHART_WIDTH - CHART_LEFT - CHART_RIGHT;
    const innerHeight = CHART_HEIGHT - CHART_TOP - CHART_BOTTOM;
    const baseline = CHART_TOP + innerHeight;

    const points: TrendPoint[] = trend.map((point, index) => ({
      x:
        trend.length === 1
          ? CHART_LEFT + innerWidth / 2
          : CHART_LEFT + (index * innerWidth) / (trend.length - 1),
      y: baseline - (point.count / max) * innerHeight,
      label: `${point.day.slice(8, 10)}/${point.day.slice(5, 7)}`,
      count: point.count,
    }));

    const line = smoothPath(points);
    const area =
      points.length > 0
        ? `${line} L${points[points.length - 1].x} ${baseline} L${points[0].x} ${baseline} Z`
        : '';

    return {
      line,
      area,
      points,
      ticks: Array.from({ length: 5 }, (_, index) => ({
        y: CHART_TOP + (innerHeight / 4) * index,
        label: String(max - step * index),
      })),
      empty: counts.every((count) => count === 0),
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
