import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AccountMenu } from '../account-menu/account-menu';

/**
 * Khung dashboard admin: rail chức năng cố định + topbar (tìm kiếm tài khoản, hàng chờ, tài khoản).
 * Không có lối quay lại giao diện sinh viên.
 */
@Component({
  selector: 'app-admin-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, AccountMenu],
  templateUrl: './admin-layout.html',
  styleUrl: './admin-layout.css',
})
export class AdminLayout {
  private readonly router = inject(Router);

  protected search(term: string, event: Event): void {
    event.preventDefault();
    const keyword = term.trim();

    if (!keyword) {
      return;
    }

    void this.router.navigate(['/admin/users'], { queryParams: { keyword } });
  }
}
