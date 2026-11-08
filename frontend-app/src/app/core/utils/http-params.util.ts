import { HttpParams } from '@angular/common/http';

/**
 * Chuyển object query thành HttpParams, hỗ trợ bộ lọc nhiều lựa chọn:
 *   toHttpParams({ subjectIds: ['a', 'b'], keyword: 'giải tích' })
 *   → ?subjectIds=a&subjectIds=b&keyword=giải%20tích
 * Giá trị null/undefined/rỗng bị bỏ qua.
 */
export function toHttpParams(source: object): HttpParams {
  let params = new HttpParams();

  for (const [key, value] of Object.entries(source)) {
    if (value === null || value === undefined || value === '') {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== null && item !== undefined && item !== '') {
          params = params.append(key, String(item));
        }
      }
      continue;
    }

    params = params.set(key, String(value));
  }

  return params;
}
