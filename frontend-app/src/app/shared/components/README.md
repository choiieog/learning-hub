# shared/components

Component/directive/pipe dùng lại ở nhiều feature (không import gì từ `features/`).

> **Hiện trạng:** thư mục này **chưa có component nào** — các trang đang viết template trực tiếp trong từng page
> (ví dụ chuông thông báo nằm trong `layouts/user-layout`, thẻ tài liệu nằm trong trang danh sách).
> Bảng dưới là danh sách dự kiến khi bắt đầu tách component dùng chung.

| Component | Dùng ở | Trạng thái |
| --- | --- | --- |
| `document-card` | danh sách tài liệu, tài liệu đã chia sẻ, top tài liệu ở dashboard | ⬜ |
| `document-filter-bar` | bộ lọc **nhiều lựa chọn**: môn học, người đăng, loại file, sắp xếp | ⬜ |
| `pagination-bar` | mọi danh sách có phân trang | ⬜ |
| `confirm-dialog` | xoá tài liệu / xoá môn học / cảnh báo tài khoản (hiện mỗi trang tự làm modal) | ⬜ |
| `empty-state` | khi danh sách rỗng hoặc lọc không ra kết quả | ⬜ |
| `loading-spinner` | trạng thái đang tải | ⬜ |
| `avatar` | header, hồ sơ, thẻ tài liệu — khung avatar theo level (phase 2) | ⬜ |
| `star-rating` | (phase 2) chấm điểm + hiển thị điểm trung bình | ⬜ |

Quy ước: standalone component, `ChangeDetectionStrategy.OnPush`, input/output bằng `input()` / `output()`,
style bằng Tailwind (không viết CSS riêng nếu không cần).
