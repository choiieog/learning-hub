import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalStorageDriver } from './local.driver';

describe('LocalStorageDriver', () => {
  let uploadRoot: string;
  let driver: LocalStorageDriver;
  let originalUploadDir: string | undefined;

  beforeAll(async () => {
    uploadRoot = await mkdtemp(join(tmpdir(), 'lh-local-'));
    originalUploadDir = process.env.UPLOAD_DIR;
    process.env.UPLOAD_DIR = uploadRoot;
    // Driver đọc UPLOAD_DIR lúc khởi tạo.
    driver = new LocalStorageDriver();
  });

  afterAll(async () => {
    process.env.UPLOAD_DIR = originalUploadDir;
    await rm(uploadRoot, { recursive: true, force: true });
  });

  it('ghi file với tên do server sinh và trả metadata đúng', async () => {
    const buffer = Buffer.from('%PDF-1.4 nội dung', 'latin1');

    const stored = await driver.upload(
      { buffer, originalName: 'Bài Giảng.PDF', mimeType: 'application/pdf' },
      'documents',
    );

    expect(stored.publicId).toMatch(/^documents\/[0-9a-f-]{36}\.pdf$/);
    expect(stored.url).toBe(`/api/files/${stored.publicId}`);
    expect(stored.name).toBe('Bài Giảng.PDF');
    expect(stored.size).toBe(buffer.length);
    expect(await readFile(join(uploadRoot, stored.publicId))).toEqual(buffer);
  });

  it('không dùng tên client gửi lên nên hai lần upload không ghi đè nhau', async () => {
    const input = {
      buffer: Buffer.from('cùng tên'),
      originalName: 'bai.pdf',
      mimeType: 'application/pdf',
    };

    const first = await driver.upload(input, 'documents');
    const second = await driver.upload(input, 'documents');

    expect(first.publicId).not.toBe(second.publicId);
    expect(existsSync(join(uploadRoot, first.publicId))).toBe(true);
    expect(existsSync(join(uploadRoot, second.publicId))).toBe(true);
  });

  it('remove xoá file và chạy lại vẫn thành công (idempotent)', async () => {
    const stored = await driver.upload(
      { buffer: Buffer.from('x'), originalName: 'a.pdf', mimeType: 'application/pdf' },
      'documents',
    );

    await driver.remove(stored.publicId);
    expect(existsSync(join(uploadRoot, stored.publicId))).toBe(false);

    await expect(driver.remove(stored.publicId)).resolves.toBeUndefined();
  });

  it('chặn publicId thoát khỏi thư mục upload', async () => {
    await writeFile(join(uploadRoot, 'bi-mat.txt'), 'không được xoá');

    await expect(driver.remove('../bi-mat.txt')).rejects.toThrow(
      'Đường dẫn file không hợp lệ',
    );
    await expect(driver.remove('documents/../../bi-mat.txt')).rejects.toThrow(
      'Đường dẫn file không hợp lệ',
    );
    expect(existsSync(join(uploadRoot, 'bi-mat.txt'))).toBe(true);
  });
});
