import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  message: string;
}

const ERROR_TTL_MS = 6000;

/**
 * Thông báo nổi cho lỗi không gắn với form nào (mất kết nối, 5xx).
 * Lỗi 4xx vẫn do từng page hiển thị cạnh form vì cần ngữ cảnh.
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly items = signal<Toast[]>([]);
  private nextId = 1;

  readonly toasts = this.items.asReadonly();

  error(message: string): void {
    const toast: Toast = { id: this.nextId++, message };

    this.items.update((current) => [...current, toast]);
    setTimeout(() => this.dismiss(toast.id), ERROR_TTL_MS);
  }

  dismiss(id: number): void {
    this.items.update((current) => current.filter((toast) => toast.id !== id));
  }
}
