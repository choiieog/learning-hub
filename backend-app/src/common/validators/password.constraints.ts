/**
 * Rule mật khẩu dùng chung cho **mọi** chỗ nhận mật khẩu mới:
 * register, reset-password, change-password.
 *
 * Trước đây mỗi DTO một kiểu (change-password chỉ `@IsNotEmpty`, register/reset
 * mới có min/max) nên cùng một mật khẩu có thể đổi được nhưng không đăng ký được.
 * Frontend dùng đúng bộ số này ở `core/validators/password.validator.ts`.
 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 72;
/** Ít nhất một chữ cái và một chữ số. */
export const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d).+$/;

export const PASSWORD_MESSAGES = {
  minLength: `Mật khẩu phải có ít nhất ${PASSWORD_MIN_LENGTH} ký tự`,
  maxLength: `Mật khẩu tối đa ${PASSWORD_MAX_LENGTH} ký tự`,
  composition: 'Mật khẩu phải gồm cả chữ cái và chữ số',
} as const;
