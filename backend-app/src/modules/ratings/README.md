# modules/ratings (phase 2)

Đánh giá sao bài viết.

- `POST /api/documents/:id/ratings` — body `{ stars: 1..5, comment? }`, unique `(documentId, userId)`
- `GET /api/documents/:id/ratings` — danh sách + phân bố 1–5 sao
- Sau mỗi lần ghi: cập nhật cache `Document.ratingAvg` / `ratingCount`, rồi cộng EXP cho tác giả (modules/gamification)

Frontend: `shared/components/star-rating` + khối đánh giá ở trang chi tiết tài liệu.
