# Infra: mail

`MailModule` (global) + `MailService` gửi email tài khoản. Hai driver: `console` cho dev và `smtp` (nodemailer) cho demo/deploy.

## Hợp đồng service

```ts
interface MailService {
  sendVerificationEmail(params: { to: string; fullName: string; token: string }): Promise<void>;
}
```

Service tự dựng link từ `APP_URL` + `token` (`${appUrl}/auth/verify-email?token=...`), nên nghiệp vụ (auth) **chỉ**
gọi `sendVerificationEmail` và không biết đang dùng driver nào.

## Driver

| `MAIL_DRIVER` | Cài đặt | Dùng khi |
| --- | --- | --- |
| `console` (mặc định) | Không cần gì | Dev/demo offline — in link ra log backend |
| `smtp` | `nodemailer` + `SMTP_*` | Demo/deploy thật — gửi email có cả text và HTML |

Biến môi trường cho `smtp`: `SMTP_HOST`, `SMTP_PORT` (mặc định 587), `SMTP_USER`, `SMTP_PASS`,
`SMTP_SECURE` (mặc định `true` khi cổng 465, còn lại `false` để dùng STARTTLS), `MAIL_FROM`.

- Thiếu `SMTP_HOST` khi `MAIL_DRIVER=smtp` → `MailService` ném lỗi ngay lúc bootstrap (fail fast, không chạy với cấu hình nửa vời).
- `SMTP_USER` rỗng → kết nối không đăng nhập (SMTP nội bộ / MailHog / sink test).
- Gửi thất bại **không** ném lỗi ra ngoài: tài khoản + token đã lưu, lỗi được log để người dùng bấm "Gửi lại email xác thực".
- Họ tên người dùng được escape trước khi chèn vào HTML.
- Transporter được tạo một lần cho mỗi process (nodemailer tự pool kết nối).

Lưu ý: không log token ở production; khi `MAIL_DRIVER=smtp` chỉ log `to` + `messageId`.
