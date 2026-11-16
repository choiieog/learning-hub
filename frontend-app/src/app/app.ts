import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastService } from './core/services/toast.service';

/** Component gốc — router-outlet (layout do từng khu vực route quyết định) + toast chung. */
@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet],
  template: `
    <router-outlet />

    <div
      class="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2"
      aria-live="polite"
    >
      @for (toast of toasts.toasts(); track toast.id) {
        <div
          class="pointer-events-auto rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 shadow-lg"
        >
          <div class="flex items-start gap-2">
            <p class="flex-1">{{ toast.message }}</p>
            <button
              type="button"
              class="text-slate-400 hover:text-slate-600"
              aria-label="Đóng thông báo"
              (click)="toasts.dismiss(toast.id)"
            >
              ×
            </button>
          </div>
        </div>
      }
    </div>
  `,
})
export class App {
  protected readonly toasts = inject(ToastService);
}
