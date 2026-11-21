import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { initials } from '../../core/utils/format.util';

/** Khung dashboard admin: rail vận hành + nội dung. Không có lối quay lại giao diện sinh viên. */
@Component({
  selector: 'app-admin-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './admin-layout.html',
  styleUrl: './admin-layout.css',
})
export class AdminLayout {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly adminInitials = computed(() =>
    initials(this.auth.currentUser()?.fullName ?? 'Quản trị viên'),
  );

  protected logout(): void {
    this.auth.logout();
    void this.router.navigate(['/auth/login']);
  }
}
