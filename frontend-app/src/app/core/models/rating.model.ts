/** Người đánh giá — kèm đủ thông tin để hiện avatar + tên trong danh sách. */
export interface RatingAuthor {
  id: string;
  fullName: string;
  avatarUrl?: string | null;
  level?: number;
}

export interface Rating {
  id: string;
  stars: number;
  comment?: string | null;
  createdAt: string;
  updatedAt: string;
  user: RatingAuthor;
}

export interface RatingSummary {
  ratingAvg: number;
  ratingCount: number;
  /** Số lượt theo từng mức sao (khoá là "1".."5" sau khi qua JSON). */
  distribution: Record<'1' | '2' | '3' | '4' | '5', number>;
}

/** Kết quả GET /api/documents/:id/ratings */
export interface RatingList {
  items: Rating[];
  meta: { page: number; limit: number; total: number; totalPages: number };
  summary: RatingSummary;
  /** Đánh giá hiện tại của người gọi; null nếu chưa đánh giá. */
  myRating: Rating | null;
}

/** Body của POST /api/documents/:id/ratings */
export interface UpsertRatingPayload {
  stars: number;
  comment?: string;
}

/** Kết quả POST — kèm cache mới để cập nhật ngay trên đầu trang. */
export interface UpsertRatingResult {
  rating: Rating;
  ratingAvg: number;
  ratingCount: number;
}
