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
import { DocumentStatus, DashboardOverview } from '../../../../core/models';
import { AuthService } from '../../../../core/services/auth.service';
import { DashboardService } from '../../../../core/services/dashboard.service';
import { getApiErrorMessages } from '../../../../core/utils/api-error.util';
import { fileExtension } from '../../../../core/utils/format.util';

const STATUS_LABEL: Record<DocumentStatus, string> = {
  PENDING: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Bị từ chối',
};

interface StatCard {
  label: string;
  value: number;
  hint: string;
  tone: 'slate' | 'emerald' | 'amber' | 'rose';
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
  template: `
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Xin chào, {{ greetingName() }}</h1>
        <p class="mt-1 text-sm text-slate-500">
          Tình hình tài liệu bạn đã chia sẻ trên Learning Hub.
        </p>
      </div>
      <a routerLink="/upload" class="btn-primary w-auto">Đăng tài liệu</a>
    </div>

    @if (errors().length > 0) {
      <div class="alert alert-error mt-6" role="alert">
        @for (error of errors(); track error) {
          <p>{{ error }}</p>
        }
      </div>
    }

    @if (loading()) {
      <div class="mt-6 space-y-6" aria-busy="true">
        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          @for (placeholder of [1, 2, 3, 4]; track placeholder) {
            <div class="animate-pulse rounded-xl border border-slate-200 bg-white p-5">
              <div class="h-3 w-1/2 rounded bg-slate-200"></div>
              <div class="mt-3 h-7 w-1/3 rounded bg-slate-100"></div>
            </div>
          }
        </div>
        <div class="grid gap-6 lg:grid-cols-2">
          @for (placeholder of [1, 2]; track placeholder) {
            <div class="animate-pulse rounded-xl border border-slate-200 bg-white p-5">
              <div class="h-4 w-1/3 rounded bg-slate-200"></div>
              <div class="mt-4 space-y-3">
                @for (row of [1, 2, 3]; track row) {
                  <div class="h-12 rounded bg-slate-100"></div>
                }
              </div>
            </div>
          }
        </div>
      </div>
    } @else if (overview(); as data) {
      @if (data.stats.pending > 0) {
        <div
          class="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3"
          role="status"
        >
          <p class="text-sm text-amber-800">
            Bạn có <strong>{{ data.stats.pending }}</strong> tài liệu đang chờ admin duyệt.
          </p>
          <a
            routerLink="/my-documents"
            [queryParams]="{ status: 'PENDING' }"
            class="text-sm font-semibold text-amber-800 underline hover:text-amber-900"
          >
            Xem danh sách
          </a>
        </div>
      }

      <!-- Thẻ số liệu -->
      <div class="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        @for (card of statCards(); track card.label) {
          <div class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {{ card.label }}
            </p>
            <p class="mt-2 text-3xl font-semibold tracking-tight" [class]="toneClass(card.tone)">
              {{ card.value }}
            </p>
            @if (card.link) {
              <a
                [routerLink]="card.link"
                [queryParams]="card.queryParams ?? null"
                class="mt-2 inline-block text-xs font-semibold text-indigo-600 hover:text-indigo-700"
              >
                {{ card.hint }}
              </a>
            } @else {
              <p class="mt-2 text-xs text-slate-400">{{ card.hint }}</p>
            }
          </div>
        }

        <!-- Lượt xem + biểu đồ 7 ngày: cùng hàng thẻ để không bị kéo dài hết chiều ngang -->
        <div class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Lượt xem</p>
          <p class="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
            {{ data.stats.totalViews }}
          </p>
          <p class="mt-2 text-xs text-slate-400">
            {{ data.stats.viewsLast7Days }} lượt trong 7 ngày gần nhất
          </p>

          <div class="mt-3 flex h-10 items-end gap-1">
            @for (point of data.viewTrend; track point.day) {
              <div
                class="h-full flex-1 rounded-t bg-indigo-500/80"
                [style.height.%]="trendHeight(point.count)"
                [attr.title]="point.day + ': ' + point.count + ' lượt xem'"
              ></div>
            }
          </div>
        </div>
      </div>

      <div class="mt-6 grid gap-6 lg:grid-cols-2">
        <!-- Tài liệu của tôi gần đây -->
        <section class="rounded-xl border border-slate-200 bg-white shadow-sm">
          <header class="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <h2 class="text-base font-semibold">Tài liệu của tôi gần đây</h2>
            <a
              routerLink="/my-documents"
              class="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
            >
              Xem tất cả
            </a>
          </header>

          @if (data.recentDocuments.length === 0) {
            <div class="px-5 py-10 text-center">
              <p class="text-sm font-medium text-slate-700">Bạn chưa chia sẻ tài liệu nào</p>
              <p class="mt-1 text-sm text-slate-500">
                Tài liệu gửi lên sẽ chờ admin duyệt trước khi hiển thị công khai.
              </p>
              <a routerLink="/upload" class="btn-primary mt-4 w-auto">Đăng tài liệu đầu tiên</a>
            </div>
          } @else {
            <ul class="divide-y divide-slate-100">
              @for (item of data.recentDocuments; track item.id) {
                <li>
                  <a
                    [routerLink]="['/documents', item.id]"
                    class="flex items-start gap-3 px-5 py-3.5 transition hover:bg-slate-50"
                  >
                    <div class="min-w-0 flex-1">
                      <p class="truncate text-sm font-semibold text-slate-900">{{ item.title }}</p>
                      <p class="mt-0.5 text-xs text-indigo-600">
                        {{ item.subject.code }} · {{ item.subject.name }}
                      </p>
                      @if (item.status === 'REJECTED' && item.rejectReason) {
                        <p class="mt-1 line-clamp-1 text-xs text-rose-600">
                          Lý do: {{ item.rejectReason }}
                        </p>
                      }
                      <p class="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                        <span>{{ item.createdAt | date: 'dd/MM/yyyy' }}</span>
                        <span aria-hidden="true">·</span>
                        <span>{{ item.viewCount }} lượt xem</span>
                        @for (file of item.files; track file.name) {
                          <span
                            class="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600"
                          >
                            {{ fileType(file.name) }}
                          </span>
                        }
                      </p>
                    </div>
                    <span [class]="badgeClass(item.status)">{{ statusLabel(item.status) }}</span>
                  </a>
                </li>
              }
            </ul>
          }
        </section>

        <!-- Tài liệu nhiều lượt xem -->
        <section class="rounded-xl border border-slate-200 bg-white shadow-sm">
          <header class="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <h2 class="text-base font-semibold">Tài liệu nhiều lượt xem</h2>
            <a routerLink="/documents" class="text-sm font-semibold text-indigo-600 hover:text-indigo-700">
              Khám phá
            </a>
          </header>

          @if (data.topDocuments.length === 0) {
            <div class="px-5 py-10 text-center">
              <p class="text-sm font-medium text-slate-700">Chưa có tài liệu nào được duyệt</p>
              <p class="mt-1 text-sm text-slate-500">Hãy là người đầu tiên chia sẻ tài liệu.</p>
            </div>
          } @else {
            <ul class="divide-y divide-slate-100">
              @for (item of data.topDocuments; track item.id) {
                <li>
                  <a
                    [routerLink]="['/documents', item.id]"
                    class="flex items-start gap-3 px-5 py-3.5 transition hover:bg-slate-50"
                  >
                    <div class="min-w-0 flex-1">
                      <p class="truncate text-sm font-semibold text-slate-900">{{ item.title }}</p>
                      <p class="mt-0.5 text-xs text-indigo-600">
                        {{ item.subject.code }} · {{ item.subject.name }}
                      </p>
                      <p class="mt-1 text-xs text-slate-400">
                        {{ item.author?.fullName ?? 'Ẩn danh' }} · {{ item.viewCount }} lượt xem
                      </p>
                    </div>
                  </a>
                </li>
              }
            </ul>
          }
        </section>
      </div>
    }
  `,
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
      {
        label: 'Bị từ chối',
        value: stats?.rejected ?? 0,
        hint: 'Có thể sửa và gửi lại',
        tone: 'rose',
        link: '/my-documents',
        queryParams: { status: 'REJECTED' },
      },
    ];
  });

  ngOnInit(): void {
    this.fetch();
  }

  protected statusLabel(status: DocumentStatus): string {
    return STATUS_LABEL[status];
  }

  protected badgeClass(status: DocumentStatus): string {
    if (status === 'APPROVED') {
      return 'shrink-0 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700';
    }

    if (status === 'REJECTED') {
      return 'shrink-0 rounded-md bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700';
    }

    return 'shrink-0 rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700';
  }

  protected toneClass(tone: StatCard['tone']): string {
    const tones: Record<StatCard['tone'], string> = {
      slate: 'text-slate-900',
      emerald: 'text-emerald-600',
      amber: 'text-amber-600',
      rose: 'text-rose-600',
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
