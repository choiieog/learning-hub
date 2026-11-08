/** Envelope backend trả về (ResponseInterceptor). */
export interface ApiResponse<T> {
  success: true;
  data: T;
  timestamp: string;
}

/** Envelope lỗi (HttpExceptionFilter). */
export interface ApiError {
  success: false;
  statusCode: number;
  message: string | string[];
  /** Optional machine-readable code, e.g. EMAIL_NOT_VERIFIED. */
  code?: string;
  path: string;
  timestamp: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  items: T[];
  meta: PaginationMeta;
}
