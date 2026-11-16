import { Validators } from '@angular/forms';

/**
 * Cùng bộ rule với backend (`common/validators/password.constraints.ts`).
 * Đổi ở một chỗ là cả register / quên mật khẩu / đổi mật khẩu khớp nhau.
 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 72;
/** Ít nhất một chữ cái và một chữ số. */
export const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d).+$/;

export const passwordValidators = [
  Validators.required,
  Validators.minLength(PASSWORD_MIN_LENGTH),
  Validators.maxLength(PASSWORD_MAX_LENGTH),
  Validators.pattern(PASSWORD_PATTERN),
];

export const PASSWORD_HINT = `Ít nhất ${PASSWORD_MIN_LENGTH} ký tự, gồm cả chữ cái và chữ số (tối đa ${PASSWORD_MAX_LENGTH}).`;
