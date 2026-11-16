/**
 * Base URL of the API.
 *
 * Relative on purpose: the Angular dev server proxies `/api` to the Nest backend
 * (see `proxy.conf.json`), so the browser never talks cross-origin and the same
 * build works when frontend and API share a domain in production.
 * TODO(phase 1): switch to an absolute URL per environment if they are deployed
 * on different domains.
 */
export const API_BASE_URL = '/api';

/**
 * Chỉ giữ hồ sơ user trong localStorage (không phải bí mật) để F5 vẫn vẽ được UI ngay.
 * Access token nằm trong memory, refresh token nằm trong cookie HttpOnly —
 * không có token nào trong localStorage.
 */
export const AUTH_USER_KEY = 'lh_user';
