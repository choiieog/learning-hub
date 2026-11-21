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
import { Rating, RatingSummary } from '../../../core/models';
import { AuthService } from '../../../core/services/auth.service';
import { RatingService } from '../../../core/services/rating.service';
import { getApiErrorMessages } from '../../../core/utils/api-error.util';
import { initials } from '../../../core/utils/format.util';

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
  templateUrl: './rating-section.html',
  styleUrl: './rating-section.css',
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
