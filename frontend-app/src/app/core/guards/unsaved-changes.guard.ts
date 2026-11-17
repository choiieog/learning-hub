import { CanDeactivateFn } from '@angular/router';

/** Component muốn được guard hỏi trước khi rời trang thì implement interface này. */
export interface HasUnsavedChanges {
  hasUnsavedChanges(): boolean;
}

/**
 * Chặn điều hướng khi dữ liệu chưa lưu — hiện dùng cho form hồ sơ (`/profile`).
 * Trang Đăng tài liệu không dùng guard: tự dọn form sau khi tạo bài để không tạo bài trùng.
 *
 * Dùng ở route-level: `canDeactivate: [unsavedChangesGuard]`. Với F5/đóng tab,
 * component tự nghe `beforeunload` (guard không chạy trong trường hợp đó).
 */
export const unsavedChangesGuard: CanDeactivateFn<HasUnsavedChanges> = (component) => {
  if (!component || !component.hasUnsavedChanges()) {
    return true;
  }

  return confirm('Bạn có thay đổi chưa lưu. Rời trang và bỏ các thay đổi này?');
};
