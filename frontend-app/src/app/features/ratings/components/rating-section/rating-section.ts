import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Rating, RatingSummary } from '../../../../core/models';
import { AuthService } from '../../../../core/services/auth.service';
import { RatingService } from '../../../../core/services/rating.service';
import { getApiErrorMessages } from '../../../../core/utils/api-error.util';
import { initials } from '../../../../core/utils/format.util';

const STAR_VALUES = [1, 2, 3, 4, 5] as const;
const STAR_VALUES_DESC = [5, 4, 3, 2, 1] as const;
type StarKey = '1' | '2' | '3' | '4' | '5';

/**
 * Khối đánh giá trong trang chi tiết tài liệu.
 *
 * Hiện điểm trung bình + phân bố 1–5 sao, form đánh giá (mỗi người một đánh giá,
 * gửi lại là cập nhật) và danh sách nhận xét có "Xem thêm".
 * Tác giả không tự đánh giá bài mình — backend chặn, UI ẩn form qua `canRate`.
 */
@Component({
  selector: 'app-rating-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe],
  template: `
    <section class="rounded-xl border border-slate-200 bg-white p-6">
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500">Đánh giá</h2>
        @if (summary(); as s) {
          <p class="text-xs text-slate-400">{{ s.ratingCount }} lượt đánh giá</p>
        }
      </div>

      @if (errors().length > 0) {
        <div class="alert alert-error mt-4" role="alert">
          @for (error of errors(); track error) {
            <p>{{ error }}</p>
          }
        </div>
      }

      @if (success()) {
        <div class="alert alert-success mt-4" role="status">
          <p>{{ success() }}</p>
        </div>
      }

      @if (loading() && items().length === 0) {
        <div class="mt-4 animate-pulse space-y-3" aria-busy="true">
          <div class="h-10 w-40 rounded bg-slate-100"></div>
          <div class="h-3 w-full rounded bg-slate-100"></div>
          <div class="h-3 w-2/3 rounded bg-slate-100"></div>
        </div>
      } @else if (summary(); as s) {
        <div class="mt-4 grid gap-6 sm:grid-cols-2">
          <div class="flex items-center gap-4">
            <p class="text-4xl font-semibold text-slate-900">{{ ratingLabel(s.ratingAvg) }}</p>
            <div>
              <div class="flex items-center gap-0.5 text-lg" aria-hidden="true">
                @for (star of stars; track star) {
                  <span [class]="star <= roundedAvg(s.ratingAvg) ? 'text-amber-500' : 'text-slate-300'">
                    ★
                  </span>
                }
              </div>
              <p class="mt-1 text-xs text-slate-500">
                {{ s.ratingCount }} lượt · thang điểm 1–5
              </p>
            </div>
          </div>

          <ul class="space-y-1.5">
            @for (star of starsDesc; track star) {
              <li class="flex items-center gap-2 text-xs text-slate-500">
                <span class="w-6 shrink-0 text-right">{{ star }}★</span>
                <span class="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <span
                    class="block h-full rounded-full bg-amber-400 transition-all"
                    [style.width.%]="percent(star)"
                  ></span>
                </span>
                <span class="w-8 shrink-0 text-right tabular-nums">
                  {{ s.distribution[starKey(star)] }}
                </span>
              </li>
            }
          </ul>
        </div>

        @if (canRate()) {
          <div class="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p class="text-sm font-semibold text-slate-800">
              {{ myRating() ? 'Đánh giá của bạn' : 'Bạn thấy tài liệu này thế nào?' }}
            </p>

            <div class="mt-2 flex flex-wrap items-center gap-1" role="radiogroup" aria-label="Chọn số sao">
              @for (star of stars; track star) {
                <button
                  type="button"
                  role="radio"
                  [attr.aria-checked]="selectedStars() === star"
                  [attr.aria-label]="star + ' sao'"
                  [class]="
                    star <= selectedStars()
                      ? 'text-2xl leading-none text-amber-500 transition hover:scale-110'
                      : 'text-2xl leading-none text-slate-300 transition hover:text-amber-400'
                  "
                  (click)="selectedStars.set(star)"
                >
                  ★
                </button>
              }
              <span class="ml-2 text-sm text-slate-500">{{ selectedStars() }}/5</span>
            </div>

            <label class="mt-4 block text-sm font-medium text-slate-700" for="rating-comment">
              Nhận xét (không bắt buộc)
            </label>
            <textarea
              id="rating-comment"
              class="field-input mt-1 min-h-20"
              rows="3"
              maxlength="1000"
              [value]="comment()"
              (input)="onCommentInput($event)"
              placeholder="Điều bạn thấy hữu ích, hoặc phần cần cải thiện..."
            ></textarea>

            <div class="mt-2 flex flex-wrap items-center justify-between gap-3">
              <p class="text-xs text-slate-400">{{ comment().length }}/1000 ký tự</p>
              <button
                type="button"
                class="btn-primary w-auto"
                [disabled]="submitting()"
                (click)="submit()"
              >
                {{ submitting() ? 'Đang gửi...' : myRating() ? 'Cập nhật đánh giá' : 'Gửi đánh giá' }}
              </button>
            </div>
          </div>
        } @else {
          <p class="mt-6 rounded-lg bg-slate-50 p-4 text-sm text-slate-500">
            Đây là tài liệu của bạn nên bạn không thể tự đánh giá.
          </p>
        }

        @if (items().length === 0) {
          <p class="mt-6 text-sm text-slate-500">Chưa có đánh giá nào. Hãy là người đầu tiên!</p>
        } @else {
          <ul class="mt-6 divide-y divide-slate-100">
            @for (rating of items(); track rating.id) {
              <li class="py-4">
                <div class="flex items-start gap-3">
                  @if (rating.user.avatarUrl) {
                    <img
                      [src]="rating.user.avatarUrl"
                      alt=""
                      class="h-9 w-9 shrink-0 rounded-full object-cover"
                    />
                  } @else {
                    <span
                      class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-500"
                    >
                      {{ authorInitials(rating.user.fullName) }}
                    </span>
                  }

                  <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p class="text-sm font-semibold text-slate-900">
                        {{ rating.user.fullName }}
                      </p>
                      @if (rating.user.id === currentUser()?.id) {
                        <span class="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold text-indigo-600">
                          Bạn
                        </span>
                      }
                      <span class="text-xs text-amber-500" [attr.aria-label]="rating.stars + ' sao'">
                        {{ starText(rating.stars) }}
                      </span>
                      <span class="text-xs text-slate-400">
                        {{ rating.updatedAt | date: 'dd/MM/yyyy' }}
                      </span>
                    </div>
                    @if (rating.comment) {
                      <p class="mt-1 whitespace-pre-line text-sm leading-relaxed text-slate-600">
                        {{ rating.comment }}
                      </p>
                    }
                  </div>
                </div>
              </li>
            }
          </ul>

          @if (meta(); as m) {
            @if (m.page < m.totalPages) {
              <button
                type="button"
                class="btn-secondary mt-4"
                [disabled]="loadingMore()"
                (click)="loadMore()"
              >
                {{ loadingMore() ? 'Đang tải...' : 'Xem thêm đánh giá' }}
              </button>
            }
          }
        }
      }
    </section>
  `,
})
export class RatingSection {
  readonly documentId = input.required<string>();
  /** Tác giả không được tự đánh giá — trang chi tiết truyền vào theo author id. */
  readonly canRate = input(true);

  private readonly ratingsApi = inject(RatingService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly currentUser = inject(AuthService).currentUser;
  protected readonly stars = STAR_VALUES;
  protected readonly starsDesc = STAR_VALUES_DESC;

  protected readonly items = signal<Rating[]>([]);
  protected readonly summary = signal<RatingSummary | null>(null);
  protected readonly myRating = signal<Rating | null>(null);
  protected readonly meta = signal<{ page: number; totalPages: number } | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadingMore = signal(false);
  protected readonly submitting = signal(false);
  protected readonly errors = signal<string[]>([]);
  protected readonly success = signal<string | null>(null);

  protected readonly selectedStars = signal(0);
  protected readonly comment = signal('');

  constructor() {
    // Đổi tài liệu (route param) → tải lại từ trang 1.
    effect(() => {
      const documentId = this.documentId();
      this.load(documentId, 1);
    });
  }

  protected ratingLabel(value: number): string {
    return value.toFixed(1);
  }

  protected roundedAvg(value: number): number {
    return Math.round(value);
  }

  protected starKey(star: number): StarKey {
    return String(star) as StarKey;
  }

  protected percent(star: number): number {
    const summary = this.summary();
    if (!summary || summary.ratingCount === 0) {
      return 0;
    }

    return Math.round((summary.distribution[this.starKey(star)] / summary.ratingCount) * 100);
  }

  protected starText(stars: number): string {
    return '★'.repeat(stars);
  }

  protected authorInitials(fullName: string): string {
    return initials(fullName);
  }

  protected onCommentInput(event: Event): void {
    this.comment.set((event.target as HTMLTextAreaElement).value);
  }

  protected loadMore(): void {
    const meta = this.meta();
    if (!meta || this.loadingMore() || meta.page >= meta.totalPages) {
      return;
    }

    this.load(this.documentId(), meta.page + 1);
  }

  protected submit(): void {
    const stars = this.selectedStars();
    const comment = this.comment().trim();

    if (stars < 1) {
      this.errors.set(['Chọn số sao từ 1 đến 5 trước khi gửi.']);
      return;
    }

    const editing = this.myRating() !== null;

    this.submitting.set(true);
    this.errors.set([]);
    this.success.set(null);

    this.ratingsApi
      .upsert(this.documentId(), { stars, comment })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.success.set(
            editing ? 'Đã cập nhật đánh giá của bạn.' : 'Cảm ơn bạn đã đánh giá tài liệu.',
          );
          this.load(this.documentId(), 1);
        },
        error: (error: unknown) => {
          this.submitting.set(false);
          this.errors.set(getApiErrorMessages(error));
        },
      });
  }

  private load(documentId: string, page: number): void {
    const append = page > 1;

    if (append) {
      this.loadingMore.set(true);
    } else {
      this.loading.set(true);
      this.errors.set([]);
    }

    this.ratingsApi
      .list(documentId, page)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.items.set(append ? [...this.items(), ...result.items] : result.items);
          this.summary.set(result.summary);
          this.meta.set({ page: result.meta.page, totalPages: result.meta.totalPages });
          this.myRating.set(result.myRating);

          if (!append) {
            this.selectedStars.set(result.myRating?.stars ?? 0);
            this.comment.set(result.myRating?.comment ?? '');
          }

          this.loading.set(false);
          this.loadingMore.set(false);
        },
        error: (error: unknown) => {
          this.errors.set(getApiErrorMessages(error));
          this.loading.set(false);
          this.loadingMore.set(false);
        },
      });
  }
}
