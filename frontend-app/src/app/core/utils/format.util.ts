/** "Nguyễn Văn An" → "VA" (lấy chữ cái đầu của 2 từ cuối). */
export function initials(fullName: string): string {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

/** "de-cuong-mon-hoc.pdf" → "PDF"; tên không có phần mở rộng → "FILE". */
export function fileExtension(fileName: string): string {
  const parts = fileName.split('.');
  if (parts.length < 2) {
    return 'FILE';
  }

  return parts[parts.length - 1].toUpperCase();
}

/** 512000 → "500 KB", 1048576 → "1 MB". */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '—';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** index;

  return `${value >= 10 || index === 0 ? Math.round(value) : value.toFixed(1)} ${units[index]}`;
}
