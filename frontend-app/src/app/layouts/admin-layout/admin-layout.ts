import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { filter, map } from 'rxjs';
import { AccountMenu } from '../account-menu/account-menu';

interface Crumb {
  label: string;
  link?: string;
}

const PAGE_TITLES: Record<string, string> = {
  '/admin/dashboard': 'Tổng quan',
  '/admin/documents': 'Phê duyệt bài viết',
  '/admin/subjects': 'Danh mục môn học',
  '/admin/users': 'Quản lý tài khoản',
  '/admin/broadcast': 'Thông báo hàng loạt',
  '/admin/settings': 'Cấu hình hệ thống',
  '/admin/profile/password': 'Đổi mật khẩu',
  '/admin/profile': 'Hồ sơ cá nhân',
};

/** Khung dashboard admin: rail chức năng cố định + header (breadcrumb, menu tài khoản). Không có lối quay lại giao diện sinh viên. */
@Component({
  selector: 'app-admin-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, AccountMenu],
  templateUrl: './admin-layout.html',
  styleUrl: './admin-layout.css',
})
export class AdminLayout {
  private readonly router = inject(Router);

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

  /** Breadcrumb dạng liên kết, thêm nhánh khi mở tệp từ hàng chờ duyệt. */
  protected readonly trail = computed<Crumb[]>(() => {
    const [path] = this.currentUrl().split('?');
    const trail: Crumb[] = [{ label: 'Trang chủ', link: '/admin/dashboard' }];

    if (path === '/admin/viewer') {
      return [
        ...trail,
        { label: 'Phê duyệt bài viết', link: '/admin/documents' },
        { label: 'Xem tệp' },
      ];
    }

    trail.push({ label: this.pageTitle() });
    return trail;
  });

}
