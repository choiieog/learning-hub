export interface AvatarFrame {
  id: string;
  name: string;
  /** Cấp tối thiểu để mở khoá khung. */
  minLevel: number;
  /** Giá trị CSS `background` để vẽ vòng quanh avatar. */
  assetUrl: string;
  unlocked: boolean;
}

/** Kết quả GET /api/avatar-frames */
export interface AvatarFramesResponse {
  items: AvatarFrame[];
  currentFrameId: string | null;
}
