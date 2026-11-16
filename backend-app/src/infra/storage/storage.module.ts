import { Global, Module } from '@nestjs/common';
import { LocalStorageDriver } from './drivers/local.driver';
import { StorageService } from './storage.service';
import { STORAGE_DRIVER, type StorageDriver } from './storage.types';

/**
 * Driver theo `STORAGE_DRIVER`. Fail fast: driver cloud cần SDK + credentials nên không
 * bao giờ tự fallback sang đĩa (file sẽ mất ở lần deploy sau).
 *
 * Export để nơi không có DI (script cron `scripts/prune-data.ts`) xoá file qua đúng
 * driver đang bật thay vì hard-code `LocalStorageDriver`.
 */
export function createStorageDriver(): StorageDriver {
  const driver = (process.env.STORAGE_DRIVER ?? 'local').trim().toLowerCase();

  if (driver === 'local') {
    return new LocalStorageDriver();
  }

  throw new Error(
    `STORAGE_DRIVER="${driver}" is not implemented. Only "local" is wired in storage.module.ts; ` +
      'add the driver in src/infra/storage/drivers and its credentials before switching.',
  );
}

/** Global so any module can inject StorageService without re-importing. */
@Global()
@Module({
  providers: [
    { provide: STORAGE_DRIVER, useFactory: createStorageDriver },
    StorageService,
  ],
  exports: [StorageService],
})
export class StorageModule {}
