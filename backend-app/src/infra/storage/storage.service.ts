import { Inject, Injectable } from '@nestjs/common';
import type { UploadFolder } from '../../common/constants/upload.constants';
import { STORAGE_DRIVER, type StorageDriver, type StorageUploadInput, type StoredFile } from './storage.types';

/**
 * Cổng duy nhất để lưu/xoá file. Business code (`UploadsService`) chỉ gọi service này,
 * nên đổi `STORAGE_DRIVER` không phải sửa nghiệp vụ.
 */
@Injectable()
export class StorageService {
  constructor(@Inject(STORAGE_DRIVER) private readonly driver: StorageDriver) {}

  get driverName(): string {
    return this.driver.name;
  }

  upload(input: StorageUploadInput, folder: UploadFolder): Promise<StoredFile> {
    return this.driver.upload(input, folder);
  }

  remove(publicId: string): Promise<void> {
    return this.driver.remove(publicId);
  }
}
