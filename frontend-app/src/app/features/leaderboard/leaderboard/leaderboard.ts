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
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { LeaderboardResponse } from '../../../core/models';
import { GamificationService } from '../../../core/services/gamification.service';
import { getApiErrorMessages } from '../../../core/utils/api-error.util';
import { initials } from '../../../core/utils/format.util';

const PAGE_SIZE = 10;

/**
 * Bảng xếp hạng sinh viên theo EXP.
 *
 * EXP do backend cộng theo sự kiện: +1 mỗi lượt xem hợp lệ, +5 mỗi đánh giá mới,
 * +20 khi bài được duyệt. Level suy ra từ tổng EXP nên trang chỉ hiển thị lại
 * `level`, `progressPercent`, `remaining` do API trả về. Số trang nằm trên URL
 * (`?page=2`) nên Back/Forward và link chia sẻ mở đúng trang.
 */
@Component({
  selector: 'app-leaderboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './leaderboard.html',
  styleUrl: './leaderboard.css',
})
export class Leaderboard implements OnInit {
  private readonly gamificationApi = inject(GamificationService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly pageSize = PAGE_SIZE;
  protected readonly data = signal<LeaderboardResponse | null>(null);
  protected readonly loading = signal(true);
  protected readonly errors = signal<string[]>([]);

  /** Tối đa 5 số trang quanh trang hiện tại. */
  protected readonly pages = computed(() => {
    const meta = this.data()?.meta;
    if (!meta) {
      return [];
    }

    const start = Math.max(1, Math.min(meta.page - 2, meta.totalPages - 4));
    const end = Math.min(meta.totalPages, start + 4);
    return Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => start + index);
  });

  protected readonly rangeLabel = computed(() => {
    const meta = this.data()?.meta;
    if (!meta || meta.total === 0) {
      return '0 sinh viên';
    }

    const from = (meta.page - 1) * meta.limit + 1;
    const to = Math.min(meta.page * meta.limit, meta.total);
    return `${from}–${to} trong ${meta.total} sinh viên`;
  });

  ngOnInit(): void {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      this.fetch(Math.max(1, Number(params.get('page')) || 1));
    });
  }

  protected goToPage(page: number): void {
    const meta = this.data()?.meta;
    if (!meta || page < 1 || page > meta.totalPages || page === meta.page) {
      return;
    }

    void this.router.navigate([], {
      relativeTo: this.route,
      replaceUrl: true,
      queryParams: { page: page > 1 ? page : null },
    });
  }

  protected authorInitials(fullName: string): string {
    return initials(fullName);
  }

  protected rankClass(rank: number): string {
    const base = 'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold';

    if (rank === 1) {
      return `${base} bg-warning-soft text-warning`;
    }

    if (rank === 2) {
      return `${base} bg-mist text-ink-soft`;
    }

    if (rank === 3) {
      return `${base} bg-orange-100 text-orange-700`;
    }

    return `${base} bg-wash text-muted`;
  }

  private fetch(page: number): void {
    this.loading.set(true);
    this.errors.set([]);

    this.gamificationApi
      .leaderboard(page, PAGE_SIZE)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (board) => {
          // Trang vượt quá dữ liệu (ví dụ vừa có người bị xoá): lùi về trang cuối.
          if (board.items.length === 0 && board.meta.page > 1) {
            void this.router.navigate([], {
              relativeTo: this.route,
              replaceUrl: true,
              queryParams: { page: board.meta.page - 1 },
            });
            return;
          }

          this.data.set(board);
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.data.set(null);
          this.errors.set(getApiErrorMessages(error));
          this.loading.set(false);
        },
      });
  }
}
