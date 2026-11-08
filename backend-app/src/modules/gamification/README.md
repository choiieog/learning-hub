# modules/gamification — EXP / level / bảng xếp hạng

- EXP cộng theo **sự kiện**, mỗi lần cộng ghi một dòng `ExpLog` (`reason`, `refId`, `delta`):
  - `VIEW` +1 — mỗi lượt xem hợp lệ (1 người / tài liệu / ngày, tự xem bài mình không cộng);
  - `RATING` +5 — chỉ khi có **đánh giá mới**; sửa lại đánh giá cũ không cộng thêm;
  - `DOCUMENT_APPROVED` +20 — khi admin duyệt bài.
- Mốc level: `levelStep(level) = round(100 * level^1.5)`; `User.level` suy ra từ tổng `User.exp`
  (`levelFromExp`), không cộng dồn riêng nên dữ liệu lệch sẽ tự sửa ở lần cộng kế tiếp.
- `GET /api/leaderboard?limit=10` (1–50) — top sinh viên (`role = USER`, chưa xoá) theo `exp` desc,
  kèm `rank`, `level`, `levelExp`, `levelStep`, `remaining`, `progressPercent`; `me` là vị trí hiện tại
  của người gọi (kể cả khi ngoài top). Admin không nằm trong bảng.
- Bảng xếp hạng không cần bảng riêng: query `User` theo `exp` (index `[level, exp]` có sẵn).

`ExpReason.ADMIN_ADJUST` để dành cho admin cộng/trừ tay (chưa có endpoint).

Frontend: trang `/leaderboard` (`features/leaderboard`) + link “Xếp hạng” trên header sinh viên;
`core/services/gamification.service.ts`.
