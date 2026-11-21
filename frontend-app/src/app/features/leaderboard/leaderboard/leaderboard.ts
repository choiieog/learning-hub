import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { LeaderboardResponse } from '../../../core/models';
import { GamificationService } from '../../../core/services/gamification.service';
import { getApiErrorMessages } from '../../../core/utils/api-error.util';
import { initials } from '../../../core/utils/format.util';

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
  templateUrl: './leaderboard.html',
  styleUrl: './leaderboard.css',
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
