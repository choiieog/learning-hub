/**
 * Catalog khung avatar — nguồn sự thật duy nhất (seed + API đều dùng danh sách này).
 *
 * `assetUrl` là giá trị CSS `background` (gradient), frontend vẽ thành vòng quanh avatar.
 * Đổi sang ảnh thật sau này chỉ cần thay `assetUrl` bằng URL ảnh và cập nhật cách render.
 */
export interface AvatarFrameDefinition {
  id: string;
  name: string;
  minLevel: number;
  assetUrl: string;
}

export const AVATAR_FRAMES: AvatarFrameDefinition[] = [
  { id: 'frame-bronze', name: 'Đồng', minLevel: 1, assetUrl: 'linear-gradient(135deg, #f59e0b, #b45309)' },
  { id: 'frame-silver', name: 'Bạc', minLevel: 3, assetUrl: 'linear-gradient(135deg, #e2e8f0, #64748b)' },
  { id: 'frame-gold', name: 'Vàng', minLevel: 5, assetUrl: 'linear-gradient(135deg, #fde68a, #f59e0b, #d97706)' },
  {
    id: 'frame-diamond',
    name: 'Kim cương',
    minLevel: 10,
    assetUrl: 'linear-gradient(135deg, #a5b4fc, #6366f1, #4338ca)',
  },
];
