import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RateLimitGuard } from './common/guards/rate-limit.guard';
import { MailModule } from './infra/mail/mail.module';
import { PrismaModule } from './infra/prisma/prisma.module';
import { StorageModule } from './infra/storage/storage.module';
import { AdminModule } from './modules/admin/admin.module';
import { AuthModule } from './modules/auth/auth.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { GamificationModule } from './modules/gamification/gamification.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { RatingsModule } from './modules/ratings/ratings.module';
import { SubjectsModule } from './modules/subjects/subjects.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { UsersModule } from './modules/users/users.module';

/**
 * Feature modules are composed here. To add one:
 * 1. create `src/modules/<name>/<name>.module.ts`
 * 2. import it below
 * 3. export its service if another module needs it
 */
@Module({
  imports: [
    PrismaModule,
    MailModule,
    StorageModule,
    AuthModule,
    UsersModule,
    SubjectsModule,
    DocumentsModule,
    GamificationModule,
    DashboardModule,
    NotificationsModule,
    RatingsModule,
    UploadsModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Global nhưng chỉ áp dụng cho route có @RateLimit (login, forgot-password, đăng tài liệu).
    { provide: APP_GUARD, useClass: RateLimitGuard },
  ],
})
export class AppModule {}
