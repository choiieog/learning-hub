import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { LeaderboardResponse } from '../../../../core/models';
import { GamificationService } from '../../../../core/services/gamification.service';
import { getApiErrorMessages } from '../../../../core/utils/api-error.util';
import { initials } from '../../../../core/utils/format.util';

/**
 * Bảng xếp hạng sinh viên theo EXP.
 *
 * EXP do backend cộng theo sự kiện: +1 mỗi lượt xem hợp lệ, +5 mỗi đánh giá mới,
 * +20 khi bài được duyệt. Level suy ra từ tổng EXP nên trang chỉ hiển thị lại
 * `level`, `progressPercent`, `remaining` do API trả về.
 */
@Component({
  selector: 'app-leaderboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Bảng xếp hạng</h1>
        <p class="mt-1 text-sm text-slate-500">
          Điểm EXP đến từ việc chia sẻ tài liệu và nhận tương tác từ cộng đồng.
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
        <div class="animate-pulse rounded-xl border border-slate-200 bg-white p-5">
          <div class="h-4 w-1/3 rounded bg-slate-200"></div>
          <div class="mt-4 h-2 w-full rounded bg-slate-100"></div>
        </div>
        <div class="animate-pulse rounded-xl border border-slate-200 bg-white p-5">
          @for (row of [1, 2, 3, 4, 5]; track row) {
            <div class="my-3 h-10 rounded bg-slate-100"></div>
          }
        </div>
      </div>
    } @else if (data(); as board) {
      @if (board.me; as me) {
        <section class="mt-6 rounded-xl border border-indigo-100 bg-white p-5 shadow-sm">
          <div class="flex flex-wrap items-center justify-between gap-4">
            <div class="flex items-center gap-3">
              @if (me.exp > 0) {
                <span
                  class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-sm font-bold text-indigo-600"
                >
                  #{{ me.rank }}
                </span>
              }
              <div>
                <p class="text-sm font-semibold text-slate-900">
                  Cấp {{ me.level }} · {{ me.exp }} EXP
                </p>
                <p class="mt-0.5 text-xs text-slate-500">
                  Còn {{ me.remaining }} EXP để lên cấp {{ me.level + 1 }}
                </p>
              </div>
            </div>
            <a
              routerLink="/my-documents"
              class="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
            >
              Xem tài liệu của bạn
            </a>
          </div>

          <div
            class="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"
            role="progressbar"
            aria-label="Tiến độ lên cấp"
            aria-valuemin="0"
            aria-valuemax="100"
            [attr.aria-valuenow]="me.progressPercent"
          >
            <div class="h-full rounded-full bg-indigo-500" [style.width.%]="me.progressPercent"></div>
          </div>
          <p class="mt-2 text-xs text-slate-400">
            {{ me.levelExp }}/{{ me.levelStep }} EXP trong cấp hiện tại
          </p>
        </section>
      }

      <section class="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <header class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4">
          <h2 class="text-base font-semibold">
            @if (board.items.length > 0) {
              Top {{ board.items.length }} sinh viên
            } @else {
              Bảng xếp hạng
            }
          </h2>
          <span class="text-xs text-slate-400">{{ board.total }} sinh viên tham gia</span>
        </header>

        @if (board.items.length === 0) {
          <div class="px-5 py-10 text-center">
            <p class="text-sm font-medium text-slate-700">Chưa có ai trên bảng xếp hạng</p>
            <p class="mt-1 text-sm text-slate-500">
              Chia sẻ tài liệu đầu tiên để bắt đầu tích EXP.
            </p>
          </div>
        } @else {
          <ul class="divide-y divide-slate-100">
            @for (entry of board.items; track entry.id) {
              <li
                class="flex items-center gap-3 px-5 py-3.5"
                [class]="entry.id === board.me?.id ? 'bg-indigo-50/40' : ''"
              >
                <span [class]="rankClass(entry.rank)">{{ entry.rank }}</span>

                @if (entry.avatarUrl) {
                  <img
                    [src]="entry.avatarUrl"
                    alt=""
                    class="h-9 w-9 shrink-0 rounded-full object-cover"
                  />
                } @else {
                  <span
                    class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-500"
                  >
                    {{ authorInitials(entry.fullName) }}
                  </span>
                }

                <div class="min-w-0 flex-1">
                  <p class="truncate text-sm font-semibold text-slate-900">
                    {{ entry.fullName }}
                    @if (entry.id === board.me?.id) {
                      <span
                        class="ml-1 rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold text-indigo-600"
                      >
                        Bạn
                      </span>
                    }
                  </p>
                  <p class="mt-0.5 text-xs text-slate-500">
                    Cấp {{ entry.level }} · {{ entry.exp }} EXP
                  </p>
                </div>

                <div class="hidden w-40 shrink-0 sm:block">
                  <div class="h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      class="h-full rounded-full bg-indigo-400"
                      [style.width.%]="entry.progressPercent"
                    ></div>
                  </div>
                  <p class="mt-1 text-right text-[11px] text-slate-400">
                    {{ entry.remaining }} EXP nữa
                  </p>
                </div>
              </li>
            }
          </ul>
        }
      </section>

      <section class="mt-6 rounded-xl border border-slate-200 bg-white p-5">
        <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500">Cách kiếm EXP</h2>
        <ul class="mt-3 grid gap-3 text-sm text-slate-600 sm:grid-cols-3">
          <li class="rounded-lg bg-slate-50 px-4 py-3">
            <span class="font-semibold text-slate-900">+1 EXP</span> cho mỗi lượt xem tài liệu hợp lệ
            (mỗi người 1 lượt/ngày).
          </li>
          <li class="rounded-lg bg-slate-50 px-4 py-3">
            <span class="font-semibold text-slate-900">+5 EXP</span> cho mỗi đánh giá mới; sửa lại
            đánh giá cũ không cộng thêm.
          </li>
          <li class="rounded-lg bg-slate-50 px-4 py-3">
            <span class="font-semibold text-slate-900">+20 EXP</span> khi tài liệu của bạn được admin
            duyệt.
          </li>
        </ul>
      </section>
    }
  `,
})
export class Leaderboard implements OnInit {
  private readonly gamificationApi = inject(GamificationService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly data = signal<LeaderboardResponse | null>(null);
  protected readonly loading = signal(true);
  protected readonly errors = signal<string[]>([]);

  ngOnInit(): void {
    this.gamificationApi
      .leaderboard(10)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (board) => {
          this.data.set(board);
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.errors.set(getApiErrorMessages(error));
          this.loading.set(false);
        },
      });
  }

  protected authorInitials(fullName: string): string {
    return initials(fullName);
  }

  protected rankClass(rank: number): string {
    const base = 'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold';

    if (rank === 1) {
      return `${base} bg-amber-100 text-amber-700`;
    }

    if (rank === 2) {
      return `${base} bg-slate-200 text-slate-600`;
    }

    if (rank === 3) {
      return `${base} bg-orange-100 text-orange-700`;
    }

    return `${base} bg-slate-50 text-slate-500`;
  }
}
