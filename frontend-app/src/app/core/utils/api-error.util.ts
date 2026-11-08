import { HttpErrorResponse } from '@angular/common/http';

const GENERIC_MESSAGE = 'Đã có lỗi xảy ra, vui lòng thử lại.';
const NETWORK_MESSAGE = 'Không kết nối được tới máy chủ. Kiểm tra backend đã chạy chưa.';

/** Turns any HTTP failure into Vietnamese lines ready to render. */
export function getApiErrorMessages(error: unknown): string[] {
  if (!(error instanceof HttpErrorResponse)) {
    return [GENERIC_MESSAGE];
  }

  if (error.status === 0) {
    return [NETWORK_MESSAGE];
  }

  const body: unknown = error.error;

  if (typeof body === 'string') {
    const trimmed = body.trim();
    return trimmed.length > 0 ? [trimmed] : [GENERIC_MESSAGE];
  }

  if (body !== null && typeof body === 'object' && 'message' in body) {
    const message = (body as { message?: unknown }).message;

    if (Array.isArray(message) && message.length > 0) {
      return message.map((item) => String(item));
    }

    if (typeof message === 'string' && message.trim().length > 0) {
      return [message];
    }
  }

  return [GENERIC_MESSAGE];
}

/** Machine-readable code from the API envelope, e.g. EMAIL_NOT_VERIFIED. */
export function getApiErrorCode(error: unknown): string | null {
  if (!(error instanceof HttpErrorResponse)) {
    return null;
  }

  const body: unknown = error.error;

  if (body !== null && typeof body === 'object' && 'code' in body) {
    const code = (body as { code?: unknown }).code;
    return typeof code === 'string' ? code : null;
  }

  return null;
}
