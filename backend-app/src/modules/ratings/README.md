# modules/ratings — đánh giá sao tài liệu

Đánh giá 1–5 sao kèm nhận xét cho tài liệu đã duyệt.

- `POST /api/documents/:documentId/ratings` — body `{ stars: 1..5, comment? }` (nhận xét ≤ 1000 ký tự).
  Unique `(documentId, userId)`: gửi lại là **cập nhật** đánh giá cũ, không tạo thêm lượt.
- `GET /api/documents/:documentId/ratings` — `{ items, meta, summary, myRating }`, phân trang `?page=&limit=`
  (mặc định 10, tối đa 50); `summary` gồm `ratingAvg`, `ratingCount`, `distribution` 1–5 sao;
  `myRating` là đánh giá của người gọi (null nếu chưa có).

Quy tắc:

- Chỉ tài liệu `APPROVED` và chưa xoá mới xem / nhận đánh giá (PENDING, REJECTED → 404).
- Tác giả không tự đánh giá bài của mình (404 kèm message giải thích).
- Sau mỗi lần ghi, cache `Document.ratingAvg` / `ratingCount` được tính lại **trong cùng transaction**,
  nên danh sách và sắp xếp `ratingAvg:desc` luôn khớp. Trung bình làm tròn 2 chữ số.

Còn lại (khi làm gamification): cộng EXP cho tác giả theo `ExpReason.RATING`.

Frontend: `features/ratings/components/rating-section` (khối đánh giá trong trang chi tiết),
`core/services/rating.service.ts`, model `rating.model.ts`. Tác giả không thấy form đánh giá.
