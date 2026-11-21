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

interface StatCard {
  label: string;
  value: number;
  hint: string;
  tone: 'slate' | 'emerald' | 'amber';
  link?: string;
  queryParams?: Record<string, string>;
}

/**
 * Trang tổng quan sinh viên.
 *
 * Một request `GET /api/dashboard/overview` trả đủ: số tài liệu theo trạng thái,
 * tổng lượt xem + lượt xem 7 ngày (kèm biểu đồ cột nhỏ), 5 tài liệu gần đây của tôi
 * và 5 tài liệu nhiều lượt xem nhất. Bảng xếp hạng level/EXP để giai đoạn 2.
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

  protected readonly statCards = computed<StatCard[]>(() => {
    const stats = this.overview()?.stats;
    return [
      {
        label: 'Tổng tài liệu',
        value: stats?.totalDocuments ?? 0,
        hint: 'Xem tài liệu đã chia sẻ',
        tone: 'slate',
        link: '/my-documents',
      },
      {
        label: 'Đã duyệt',
        value: stats?.approved ?? 0,
        hint: 'Đang hiển thị công khai',
        tone: 'emerald',
        link: '/my-documents',
        queryParams: { status: 'APPROVED' },
      },
      {
        label: 'Chờ duyệt',
        value: stats?.pending ?? 0,
        hint: 'Admin sẽ xử lý sớm',
        tone: 'amber',
        link: '/my-documents',
        queryParams: { status: 'PENDING' },
      },
    ];
  });

  ngOnInit(): void {
    this.fetch();
  }

  protected statusLabel(status: DocumentStatus): string {
    return DOCUMENT_STATUS_LABEL[status];
  }

  protected badgeClass(status: DocumentStatus): string {
    if (status === 'APPROVED') {
      return 'shrink-0 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700';
    }

    return 'shrink-0 rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700';
  }

  protected toneClass(tone: StatCard['tone']): string {
    const tones: Record<StatCard['tone'], string> = {
      slate: 'text-slate-900',
      emerald: 'text-emerald-600',
      amber: 'text-amber-600',
    };

    return tones[tone];
  }

  /** Chiều cao cột theo giá trị lớn nhất trong 7 ngày; ngày 0 vẫn có 1% để thấy trục. */
  protected trendHeight(count: number): number {
    const trend = this.overview()?.viewTrend ?? [];
    const max = Math.max(1, ...trend.map((point) => point.count));
    return Math.max(2, Math.round((count / max) * 100));
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
