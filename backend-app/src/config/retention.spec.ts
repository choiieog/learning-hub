import { describe, expect, it } from '@jest/globals';
import { retentionDays } from './retention.js';

describe('retentionDays', () => {
  it.each([
    ['thiếu biến', undefined],
    ['chuỗi rỗng', ''],
    ['bằng 0', '0'],
    ['số âm', '-7'],
    ['không phải số', 'abc'],
    ['vô cực', 'Infinity'],
  ])('dùng mặc định khi %s', (_case, value) => {
    expect(retentionDays(value, 180)).toBe(180);
  });

  it('dùng giá trị hợp lệ thay cho mặc định', () => {
    expect(retentionDays('30', 180)).toBe(30);
  });
});
