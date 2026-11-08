import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

/** Khung dashboard admin: sidebar + nội dung. */
@Component({
  selector: 'app-admin-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="min-h-screen bg-slate-100 text-slate-900">
      <div class="flex min-h-screen flex-col md:flex-row">
        <aside
          class="w-full shrink-0 border-b border-slate-200 bg-white px-4 py-4 md:min-h-screen md:w-60 md:border-b-0 md:border-r md:py-6"
        >
          <p class="mb-4 whitespace-nowrap text-lg font-semibold text-indigo-600 md:mb-6">
            Learning Hub · Admin
          </p>

          <nav class="flex flex-wrap gap-1 text-sm md:flex-col">
            <a
              routerLink="/admin/dashboard"
              routerLinkActive="bg-indigo-50 text-indigo-700 font-medium"
              class="rounded-md px-3 py-2 hover:bg-slate-100"
            >
              Tổng quan
            </a>
            <a
              routerLink="/admin/subjects"
              routerLinkActive="bg-indigo-50 text-indigo-700 font-medium"
              class="rounded-md px-3 py-2 hover:bg-slate-100"
            >
              Danh mục môn học
            </a>
            <a
              routerLink="/admin/documents"
              routerLinkActive="bg-indigo-50 text-indigo-700 font-medium"
              class="rounded-md px-3 py-2 hover:bg-slate-100"
            >
              Phê duyệt bài viết
            </a>
            <a
              routerLink="/admin/users"
              routerLinkActive="bg-indigo-50 text-indigo-700 font-medium"
              class="rounded-md px-3 py-2 hover:bg-slate-100"
            >
              Quản lý tài khoản
            </a>
            <a
              routerLink="/admin/broadcast"
              routerLinkActive="bg-indigo-50 text-indigo-700 font-medium"
              class="rounded-md px-3 py-2 hover:bg-slate-100"
            >
              Thông báo hàng loạt
            </a>
            <a
              routerLink="/admin/settings"
              routerLinkActive="bg-indigo-50 text-indigo-700 font-medium"
              class="rounded-md px-3 py-2 hover:bg-slate-100"
            >
              Cấu hình hệ thống
            </a>
          </nav>

          <div class="mt-4 flex items-center justify-between gap-4 border-t border-slate-200 pt-4 text-sm md:mt-8 md:block">
            <a routerLink="/documents" class="text-slate-500 hover:text-slate-700">
              ← Về giao diện sinh viên
            </a>
            <button
              type="button"
              class="rounded-md border border-slate-300 px-3 py-1 text-left hover:bg-slate-100 md:mt-3 md:block md:w-full"
              (click)="logout()"
            >
              Đăng xuất
            </button>
          </div>
        </aside>

        <main class="mx-auto min-w-0 w-full max-w-6xl flex-1 px-4 py-6 md:px-8">
          <router-outlet />
        </main>
      </div>
    </div>
  `,
})
export class AdminLayout {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected logout(): void {
    this.auth.logout();
    void this.router.navigate(['/auth/login']);
  }
}
