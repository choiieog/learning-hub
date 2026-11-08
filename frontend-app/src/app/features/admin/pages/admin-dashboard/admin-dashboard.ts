import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { AdminOverview } from '../../../../core/models';
import { AdminService } from '../../../../core/services/admin.service';
import { getApiErrorMessages } from '../../../../core/utils/api-error.util';

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
  template: `
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Tổng quan quản trị</h1>
        <p class="mt-1 text-sm text-slate-500">Sức khoẻ thư viện tài liệu và hoạt động gần đây.</p>
      </div>
      <a routerLink="/admin/documents" class="btn-primary w-auto">
        Xử lý hàng chờ{{ overview() ? ' (' + overview()!.documents.pending + ')' : '' }}
      </a>
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
                @for (row of [1, 2, 3, 4]; track row) {
                  <div class="h-12 rounded bg-slate-100"></div>
                }
              </div>
            </div>
          }
        </div>
      </div>
    } @else if (overview(); as data) {
      @if (data.documents.pending > 0) {
        <div
          class="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3"
          role="status"
        >
          <p class="text-sm text-amber-800">
            Có <strong>{{ data.documents.pending }}</strong> tài liệu đang chờ duyệt.
          </p>
          <a
            routerLink="/admin/documents"
            class="text-sm font-semibold text-amber-800 underline hover:text-amber-900"
          >
            Duyệt ngay
          </a>
        </div>
      }

      <div class="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Người dùng</p>
          <p class="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
            {{ data.users.total }}
          </p>
          <p class="mt-2 text-xs text-slate-400">
            +{{ data.users.newIn7Days }} trong 7 ngày · {{ data.users.warned }} bị cảnh báo ·
            {{ data.users.banned }} bị khoá
          </p>
        </div>

        <div class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Tài liệu</p>
          <p class="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
            {{ data.documents.total }}
          </p>
          <p class="mt-2 text-xs text-slate-400">
            {{ data.documents.approved }} đã duyệt · {{ data.documents.rejected }} bị từ chối
          </p>
        </div>

        <div class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Chờ duyệt</p>
          <p class="mt-2 text-3xl font-semibold tracking-tight text-amber-600">
            {{ data.documents.pending }}
          </p>
          <a
            routerLink="/admin/documents"
            class="mt-2 inline-block text-xs font-semibold text-indigo-600 hover:text-indigo-700"
          >
            Mở hàng chờ
          </a>
        </div>

        <div class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Lượt xem</p>
          <p class="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
            {{ data.views.total }}
          </p>
          <p class="mt-2 text-xs text-slate-400">{{ data.views.in7Days }} lượt trong 7 ngày</p>
        </div>
      </div>

      <div class="mt-6 grid gap-6 lg:grid-cols-2">
        <section class="rounded-xl border border-slate-200 bg-white shadow-sm">
          <header class="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <h2 class="text-base font-semibold">Tài liệu nhiều lượt xem</h2>
            <a routerLink="/documents" class="text-sm font-semibold text-indigo-600 hover:text-indigo-700">
              Xem thư viện
            </a>
          </header>

          @if (data.topDocuments.length === 0) {
            <p class="px-5 py-8 text-center text-sm text-slate-500">Chưa có tài liệu đã duyệt.</p>
          } @else {
            <ul class="divide-y divide-slate-100">
              @for (item of data.topDocuments; track item.id) {
                <li class="flex items-start gap-3 px-5 py-3.5">
                  <div class="min-w-0 flex-1">
                    <a
                      [routerLink]="['/documents', item.id]"
                      class="truncate text-sm font-semibold text-slate-900 hover:text-indigo-700"
                    >
                      {{ item.title }}
                    </a>
                    <p class="mt-0.5 text-xs text-indigo-600">
                      {{ item.subject.code }} · {{ item.subject.name }}
                    </p>
                    <p class="mt-1 text-xs text-slate-400">
                      {{ item.author.fullName }} · {{ item.viewCount }} lượt xem
                    </p>
                  </div>
                </li>
              }
            </ul>
          }
        </section>

        <section class="rounded-xl border border-slate-200 bg-white shadow-sm">
          <header class="border-b border-slate-100 px-5 py-4">
            <h2 class="text-base font-semibold">Hoạt động gần đây</h2>
          </header>

          @if (data.recentActivity.length === 0) {
            <p class="px-5 py-8 text-center text-sm text-slate-500">Chưa có hoạt động nào.</p>
          } @else {
            <ul class="divide-y divide-slate-100">
              @for (activity of data.recentActivity; track activity.id) {
                <li class="flex items-start gap-3 px-5 py-3">
                  <span [class]="activityBadgeClass(activity.type)">
                    {{ activity.type === 'WARNING' ? 'Cảnh báo' : 'Tài liệu' }}
                  </span>
                  <div class="min-w-0 flex-1">
                    <p class="text-sm text-slate-700">{{ activity.message }}</p>
                    <p class="mt-0.5 text-xs text-slate-400">
                      {{ activity.createdAt | date: 'dd/MM/yyyy HH:mm' }}
                    </p>
                  </div>
                </li>
              }
            </ul>
          }
        </section>
      </div>
    }
  `,
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
      ? 'shrink-0 rounded-md bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700'
      : 'shrink-0 rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] font-bold text-indigo-700';
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
