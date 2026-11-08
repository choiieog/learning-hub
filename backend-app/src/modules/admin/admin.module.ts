import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module';
import { SubjectsModule } from '../subjects/subjects.module';
import { UsersModule } from '../users/users.module';
import { AdminDashboardController } from './admin-dashboard.controller';
import { AdminDocumentsController } from './admin-documents.controller';
import { AdminService } from './admin.service';
import { AdminSubjectsController } from './admin-subjects.controller';
import { AdminUsersController } from './admin-users.controller';

/**
 * Toàn bộ endpoint admin nằm ở đây, prefix /api/admin.
 * Controller chỉ điều phối — nghiệp vụ vẫn nằm trong service của module tương ứng.
 * Bảo vệ: @UseGuards(JwtAuthGuard, RolesGuard) + @Roles(Role.ADMIN) ở từng controller.
 */
@Module({
  imports: [UsersModule, SubjectsModule, DocumentsModule],
  controllers: [
    AdminDashboardController,
    AdminDocumentsController,
    AdminSubjectsController,
    AdminUsersController,
  ],
  providers: [AdminService],
})
export class AdminModule {}
