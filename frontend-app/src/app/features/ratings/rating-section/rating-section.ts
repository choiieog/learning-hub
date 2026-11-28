import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
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
import { Avatar } from '../../../shared/components/avatar/avatar';

const STAR_VALUES = [1, 2, 3, 4, 5] as const;
const STAR_VALUES_DESC = [5, 4, 3, 2, 1] as const;
type StarKey = '1' | '2' | '3' | '4' | '5';

/**
 * Khối đánh giá trong trang chi tiết tài liệu.
 *
 * Hiện điểm trung bình + phân bố 1–5 sao, form đánh giá (mỗi người một đánh giá,
 * gửi lại là cập nhật) và danh sách nhận xét có phân trang.
 * Tác giả không tự đánh giá bài mình — backend chặn, UI ẩn form qua `canRate`.
 */
@Component({
  selector: 'app-rating-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, Avatar],
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
  protected readonly meta = signal<{
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  } | null>(null);
  protected readonly loading = signal(true);
  protected readonly submitting = signal(false);
  protected readonly errors = signal<string[]>([]);
  protected readonly success = signal<string | null>(null);

  protected readonly selectedStars = signal(0);
  protected readonly comment = signal('');

  /** Tối đa 5 số trang quanh trang hiện tại, giống phân trang thư viện. */
  protected readonly pages = computed(() => {
    const meta = this.meta();
    if (!meta || meta.totalPages <= 1) {
      return [];
    }

    const start = Math.max(1, Math.min(meta.page - 2, meta.totalPages - 4));
    const end = Math.min(meta.totalPages, start + 4);
    return Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => start + index);
  });

  protected readonly rangeLabel = computed(() => {
    const meta = this.meta();
    if (!meta || meta.total === 0) {
      return '0 đánh giá';
    }

    const from = (meta.page - 1) * meta.limit + 1;
    const to = Math.min(meta.page * meta.limit, meta.total);
    return `${from}–${to} trong ${meta.total} đánh giá`;
  });

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

  protected onCommentInput(event: Event): void {
    this.comment.set((event.target as HTMLTextAreaElement).value);
  }

  protected goToPage(page: number): void {
    const meta = this.meta();
    if (!meta || page < 1 || page > meta.totalPages || page === meta.page) {
      return;
    }

    this.load(this.documentId(), page);
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
    this.loading.set(true);
    this.errors.set([]);

    this.ratingsApi
      .list(documentId, page)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.items.set(result.items);
          this.summary.set(result.summary);
          this.meta.set(result.meta);
          this.myRating.set(result.myRating);

          // Chỉ đồng bộ form ở trang đầu, để chuyển trang không xoá nội dung đang gõ.
          if (page === 1) {
            this.selectedStars.set(result.myRating?.stars ?? 0);
            this.comment.set(result.myRating?.comment ?? '');
          }

          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.errors.set(getApiErrorMessages(error));
          this.loading.set(false);
        },
      });
  }
}
