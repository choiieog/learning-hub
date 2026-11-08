import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/** Khung trang đăng nhập / đăng ký: căn giữa màn hình. */
@Component({
  selector: 'app-auth-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet],
  template: `
    <div class="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div class="w-full max-w-md rounded-xl bg-white p-8 shadow-sm">
        <p class="mb-6 text-center text-xl font-semibold text-indigo-600">Learning Hub</p>
        <router-outlet />
      </div>
    </div>
  `,
})
export class AuthLayout {}
