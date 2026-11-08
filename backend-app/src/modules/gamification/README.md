# modules/gamification (phase 2)

Level / EXP / bảng xếp hạng.

- EXP: `viewCount * 1 + ratingCount * 5 + ratingAvg * 2` (xem `docs/DECISIONS.md` mục 10)
- Mốc: `expNeeded(level) = 100 * level^1.5`
- Ghi `ExpLog` mỗi lần cộng, cập nhật `User.exp` / `User.level` (có thể chạy theo cron/queue để không chặn request xem tài liệu)
- `GET /api/leaderboard?limit=10` — top sinh viên theo level, exp
- Mở khóa `AvatarFrame` khi đạt `minLevel`; trang hồ sơ cho chọn khung đã mở

Frontend: widget bảng xếp hạng ở `features/dashboard`, chọn khung ở `features/profile`.
