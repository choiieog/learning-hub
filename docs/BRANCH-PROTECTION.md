# Bảo vệ nhánh `main`

Mục tiêu: không ai (kể cả chính bạn lúc vội) đẩy thẳng code chưa qua CI lên `main`.
Khi bật, mọi thay đổi vào `main` phải đi qua pull request và hai job của
[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) phải xanh trước khi merge.

## Yêu cầu

- Tài khoản GitHub có quyền **admin** trên `choiieog/learning-hub`.
- [`gh` CLI](https://cli.github.com) đã đăng nhập: `gh auth login --hostname github.com`
  (scope mặc định `repo` là đủ) và `jq` để dựng payload.
- Repo để **public** nên branch protection dùng được cả với tài khoản miễn phí;
  nếu chuyển sang **private** thì tính năng này cần GitHub Pro/Team.

## Cách 1 — chạy script (khuyến nghị)

```bash
./scripts/setup-branch-protection.sh --dry-run   # xem JSON trước, không gọi API
./scripts/setup-branch-protection.sh             # áp dụng
```

Script tự lấy `owner/repo` từ remote `origin`, kiểm tra `gh` đã đăng nhập và tài khoản
có quyền admin rồi mới gọi API. Chạy lại nhiều lần được (mỗi lần là ghi đè cấu hình cũ).

Tuỳ chọn:

| Cờ | Ý nghĩa |
| --- | --- |
| `--repo owner/name` | Đổi repo đích (mặc định: remote `origin`) |
| `--branch <name>` | Đổi nhánh cần bảo vệ (mặc định: `main`) |
| `--approvals <n>` | Số người phải duyệt (mặc định `0` — vẫn tự merge PR của mình được) |
| `--no-enforce-admins` | Cho admin bỏ qua luật (mặc định: admin cũng bị áp dụng) |
| `--dry-run` | Chỉ in payload JSON |

## Script bật những gì

- **Require a pull request before merging**, số approval = `0` → không push trực tiếp được,
  nhưng làm một mình vẫn merge được ngay.
- **Require status checks to pass**, `strict: true` (nhánh phải cập nhật với `main` trước khi merge),
  gồm đúng hai check đang chạy:
  - `Backend · typecheck / lint / build / unit / e2e`
  - `Frontend · build`
- **Chặn force push và xoá nhánh** (`allow_force_pushes: false`, `allow_deletions: false`).
- **Áp dụng cả với admin** (`enforce_admins: true`), trừ khi dùng `--no-enforce-admins`.

Tên check phải khớp **chính xác** với `name:` của job trong workflow; đổi tên job thì phải
chạy lại script, nếu không PR sẽ kẹt ở trạng thái “đang chờ check không tồn tại”.

## Cách 2 — Rulesets trên giao diện

1. Repo → **Settings** → **Rules** → **Rulesets** → **New ruleset** → **New branch ruleset**.
2. Name `main protection`, **Enforcement status: Active**.
3. **Target branches** → *Add target* → **Include default branch** (hoặc pattern `main`).
4. Bật **Require a pull request before merging** (approvals = 0) và
   **Require status checks to pass**, thêm hai check ở trên (nên bật *Require branches to be up to date*).
5. Bật **Block force pushes** → **Create**.

Ruleset là bản hiện đại của branch protection; đừng bật song song cả hai cách cho cùng nhánh
để tránh khó đoán luật nào đang chặn.

## Cách 3 — gọi API thủ công

```bash
gh api -X PUT repos/choiieog/learning-hub/branches/main/protection --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["Backend · typecheck / lint / build / unit / e2e", "Frontend · build"]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": { "required_approving_review_count": 0 },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
```

## Kiểm chứng

```bash
gh api repos/choiieog/learning-hub/branches/main/protection \
  --jq '{checks: .required_status_checks.contexts, strict: .required_status_checks.strict, admins: .enforce_admins.enabled}'
```

Cách chắc chắn nhất: thử `git push origin HEAD:main` khi đang có commit mới → GitHub từ chối
(`protected branch hook declined`), và mở một PR để thấy hai check xuất hiện trong mục *Checks*.

## Gỡ bỏ hoặc tạm tắt

```bash
gh api -X DELETE repos/choiieog/learning-hub/branches/main/protection
```

Hoặc vào **Settings → Rules / Branches** đổi *Enforcement status* sang **Disabled** (ruleset)
để tạm tắt mà vẫn giữ cấu hình. Chỉ nên tắt khi thật cần sửa gấp, và bật lại ngay sau đó.

## Ảnh hưởng tới quy trình làm việc

- Quy trình từ nay: tạo nhánh → commit → push nhánh → mở PR → đợi CI xanh → squash merge.
- `concurrency: ci-${{ github.ref }}` trong workflow huỷ run cũ khi push thêm commit vào cùng nhánh;
  check của commit mới nhất vẫn được đánh giá bình thường, run bị huỷ không tính là đỏ.
- Hotfix khẩn cấp: dùng `--no-enforce-admins` (hoặc để admin bypass) thay vì xoá protection.
