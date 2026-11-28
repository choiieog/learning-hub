import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { initials } from '../../../core/utils/format.util';

/**
 * Avatar dùng chung cho mọi trang: ảnh tròn + khung avatar theo cấp.
 *
 * Ảnh luôn bị cắt trong ô tròn (`object-fit: cover`) và ô có kích thước cố định,
 * nên ảnh dọc/rất dài không thể làm vỡ layout. Khung nhận giá trị CSS `background`
 * do backend trả (`linear-gradient(...)` hoặc URL ảnh) và được vẽ thành vòng bao.
 */
@Component({
  selector: 'app-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './avatar.html',
  styleUrl: './avatar.css',
})
export class Avatar {
  readonly avatarUrl = input<string | null | undefined>(null);
  /** Giá trị CSS `background-image`/`background` của khung (null = không khung). */
  readonly frameUrl = input<string | null | undefined>(null);
  readonly name = input('');
  readonly size = input(40);

  protected readonly initialsText = computed(() => initials(this.name()));
  protected readonly fontSize = computed(() => Math.max(9, Math.round(this.size() * 0.32)));
  /** Viền mảnh: ~5% kích thước (96px → 5px), tối thiểu 1.5px để vẫn thấy ở avatar nhỏ. */
  protected readonly ringWidth = computed(() => Math.max(1.5, Math.round(this.size() * 0.05 * 2) / 2));

  /** Backend có thể trả gradient hoặc URL trần — chuẩn hoá về một giá trị background-image hợp lệ. */
  protected readonly frameImage = computed(() => {
    const frame = (this.frameUrl() ?? '').trim();

    if (!frame) {
      return null;
    }

    return /^(url\(|(repeating-)?(linear|radial|conic)-gradient\()/i.test(frame)
      ? frame
      : `url("${frame}")`;
  });
}
