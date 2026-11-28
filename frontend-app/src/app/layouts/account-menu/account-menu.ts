import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { NotificationStateService } from '../../core/services/notification-state.service';
import { Avatar } from '../../shared/components/avatar/avatar';

/**
 * Cụm tài khoản trên topbar: avatar + tên, bấm mở dropdown.
 *
 * Dùng chung cho cả không gian sinh viên và quản trị nên role, đường dẫn hồ sơ và
 * mục thông báo đều suy ra từ phiên đăng nhập thay vì truyền vào từ layout.
 */
@Component({
  selector: 'app-account-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Avatar],
  templateUrl: './account-menu.html',
})
export class AccountMenu {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly notificationState = inject(NotificationStateService);

  protected readonly user = this.auth.currentUser;
  protected readonly isAdmin = this.auth.isAdmin;
  protected readonly avatarFrame = computed(
    () => this.user()?.avatarFrameUrl ?? null,
  );
  protected readonly roleLabel = computed(() => (this.isAdmin() ? 'Quản trị viên' : 'Sinh viên'));
  protected readonly profileLink = this.auth.profilePath;
  protected readonly unreadCount = this.notificationState.unreadCount;
  protected readonly open = signal(false);

  protected toggle(): void {
    this.open.set(!this.open());
  }

  protected close(): void {
    this.open.set(false);
  }

  protected logout(): void {
    this.auth.logout();
    void this.router.navigate(['/auth/login']);
  }
}
