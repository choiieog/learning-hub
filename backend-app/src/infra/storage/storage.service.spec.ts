import { describe, expect, it, jest } from '@jest/globals';
import type { UploadFolder } from '../../common/constants/upload.constants';
import type { StorageDriver, StorageUploadInput, StoredFile } from './storage.types';
import { StorageService } from './storage.service';

const STORED: StoredFile = {
  url: '/api/files/documents/a.pdf',
  publicId: 'documents/a.pdf',
  name: 'a.pdf',
  size: 3,
  mimeType: 'application/pdf',
};

function setup() {
  const driver = {
    name: 'fake',
    upload: jest.fn(
      async (_input: StorageUploadInput, _folder: UploadFolder) => STORED,
    ),
    remove: jest.fn(async (_publicId: string) => undefined),
  };
  const service = new StorageService(driver as unknown as StorageDriver);

  return { service, driver };
}

describe('StorageService', () => {
  it('chuyển tiếp upload/remove cho driver', async () => {
    const { service, driver } = setup();
    const input = { buffer: Buffer.from('abc'), originalName: 'a.pdf', mimeType: 'application/pdf' };

    await expect(service.upload(input, 'documents')).resolves.toEqual(STORED);
    await service.remove('documents/a.pdf');

    expect(driver.upload).toHaveBeenCalledWith(input, 'documents');
    expect(driver.remove).toHaveBeenCalledWith('documents/a.pdf');
  });

  it('removeMany bỏ qua publicId null và xoá từng file', async () => {
    const { service, driver } = setup();

    await service.removeMany(['documents/a.pdf', null, 'avatars/b.png']);

    expect(driver.remove).toHaveBeenCalledTimes(2);
    expect(driver.remove).toHaveBeenLastCalledWith('avatars/b.png');
  });

  it('removeMany không ném lỗi khi một file không xoá được (dọn file mồ côi)', async () => {
    const { service, driver } = setup();
    driver.remove.mockRejectedValueOnce(new Error('EACCES'));

    await expect(
      service.removeMany(['documents/hong.pdf', 'documents/ok.pdf']),
    ).resolves.toBeUndefined();

    expect(driver.remove).toHaveBeenCalledTimes(2);
    expect(driver.remove).toHaveBeenLastCalledWith('documents/ok.pdf');
  });
});
