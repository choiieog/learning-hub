import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { filter, map } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { initials } from '../../core/utils/format.util';

const RAIL_STORAGE_KEY = 'lh.admin.rail.mini';

const PAGE_TITLES: Record<string, string> = {
  '/admin/dashboard': 'Tổng quan',
  '/admin/documents': 'Phê duyệt bài viết',
  '/admin/subjects': 'Danh mục môn học',
  '/admin/users': 'Quản lý tài khoản',
  '/admin/broadcast': 'Thông báo hàng loạt',
  '/admin/settings': 'Cấu hình hệ thống',
};

/** Khung dashboard admin: rail vận hành thu gọn được + header. Không có lối quay lại giao diện sinh viên. */
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

  protected readonly mini = signal(this.readMini());
  protected readonly railToggleLabel = computed(() =>
    this.mini() ? 'Mở rộng thanh điều hướng' : 'Thu gọn thanh điều hướng',
  );

  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );

  protected readonly pageTitle = computed(() => {
    const path = this.currentUrl().split('?')[0].split('#')[0];
    const match = Object.keys(PAGE_TITLES)
      .sort((a, b) => b.length - a.length)
      .find((route) => path === route || path.startsWith(`${route}/`));

    return match ? PAGE_TITLES[match] : 'Tổng quan';
  });

  protected toggleRail(): void {
    const next = !this.mini();
    this.mini.set(next);

    try {
      localStorage.setItem(RAIL_STORAGE_KEY, next ? '1' : '0');
    } catch {
      // Chế độ riêng tư có thể chặn localStorage; thu gọn vẫn hoạt động trong phiên.
    }
  }

  protected logout(): void {
    this.auth.logout();
    void this.router.navigate(['/auth/login']);
  }

  private readMini(): boolean {
    try {
      return localStorage.getItem(RAIL_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  }
}
