import { DocumentStatus } from '../models';

/**
 * Nhãn hiển thị của trạng thái duyệt.
 *
 * Từ chối không còn là trạng thái: admin từ chối là xoá hẳn tài liệu nên chỉ
 * còn PENDING/APPROVED trong dữ liệu.
 */
export const DOCUMENT_STATUS_LABEL: Record<DocumentStatus, string> = {
  PENDING: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
};
