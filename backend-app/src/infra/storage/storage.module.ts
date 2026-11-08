import { Global, Module } from '@nestjs/common';
import { LocalStorageDriver } from './drivers/local.driver';
import { StorageService } from './storage.service';
import { STORAGE_DRIVER, type StorageDriver } from './storage.types';

/** Global so any module can inject StorageService without re-importing. */
@Global()
@Module({
  providers: [
    {
      provide: STORAGE_DRIVER,
      // Fail fast at bootstrap: a cloud driver needs its SDK + credentials, so never
      // silently fall back to local disk (that would lose files on the next deploy).
      useFactory: (): StorageDriver => {
        const driver = (process.env.STORAGE_DRIVER ?? 'local').trim().toLowerCase();

        if (driver === 'local') {
          return new LocalStorageDriver();
        }

        throw new Error(
          `STORAGE_DRIVER="${driver}" is not implemented. Only "local" is wired in storage.module.ts; ` +
            'add the driver in src/infra/storage/drivers and its credentials before switching.',
        );
      },
    },
    StorageService,
  ],
  exports: [StorageService],
})
export class StorageModule {}
