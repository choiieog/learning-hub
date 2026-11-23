import { describe, expect, it } from '@jest/globals';
import { retentionDays, retentionWindowsFromEnv } from './retention.js';

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

describe('retentionWindowsFromEnv', () => {
  it('mỗi biến env đi vào đúng cửa sổ của nó', () => {
    const windows = retentionWindowsFromEnv({
      DOCUMENT_VIEW_RETENTION_DAYS: '30',
      NOTIFICATION_READ_RETENTION_DAYS: '60',
      PERSONAL_NOTIFICATION_RETENTION_DAYS: '90',
      EXP_LOG_RETENTION_DAYS: '120',
    });

    expect(windows).toEqual({
      documentViewDays: 30,
      notificationReadDays: 60,
      personalNotificationDays: 90,
      expLogDays: 120,
    });
  });

  it('thiếu cả bốn biến thì mỗi cửa sổ dùng 180', () => {
    expect(retentionWindowsFromEnv({})).toEqual({
      documentViewDays: 180,
      notificationReadDays: 180,
      personalNotificationDays: 180,
      expLogDays: 180,
    });
  });
});
