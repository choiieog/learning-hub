import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import {
  DEFAULT_DOCUMENT_DAILY_LIMIT,
  MAX_DOCUMENT_DAILY_LIMIT,
  SETTING_KEYS,
} from './settings.constants';

export interface SystemSettings {
  /** Số tài liệu tối đa mỗi sinh viên được đăng trong một ngày; 0 = không giới hạn. */
  documentDailyLimit: number;
  updatedAt: Date | null;
}

/**
 * Cấu hình hệ thống (bảng `SystemSetting`, key/value JSON).
 *
 * Hiện có một cấu hình: giới hạn số bài đăng mỗi ngày. `DocumentsService.create` đọc
 * giá trị này trước khi tạo bài nên admin đổi là áp dụng ngay, không cần restart.
 * Đọc thẳng từ DB mỗi lần đăng bài (một query nhỏ) để tránh cache lệch giữa các instance.
 */
@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings(): Promise<SystemSettings> {
    const row = await this.prisma.systemSetting.findUnique({
      where: { key: SETTING_KEYS.DOCUMENT_DAILY_LIMIT },
    });

    return {
      documentDailyLimit: readLimit(row?.value),
      updatedAt: row?.updatedAt ?? null,
    };
  }

  /** Giá trị đang áp dụng cho việc đăng bài (0 = không giới hạn). */
  async getDocumentDailyLimit(): Promise<number> {
    const row = await this.prisma.systemSetting.findUnique({
      where: { key: SETTING_KEYS.DOCUMENT_DAILY_LIMIT },
      select: { value: true },
    });

    return readLimit(row?.value);
  }

  async updateSettings(input: { documentDailyLimit: number }): Promise<SystemSettings> {
    const documentDailyLimit = clampLimit(input.documentDailyLimit);

    const row = await this.prisma.systemSetting.upsert({
      where: { key: SETTING_KEYS.DOCUMENT_DAILY_LIMIT },
      update: { value: documentDailyLimit },
      create: { key: SETTING_KEYS.DOCUMENT_DAILY_LIMIT, value: documentDailyLimit },
    });

    return { documentDailyLimit, updatedAt: row.updatedAt };
  }
}

function clampLimit(value: number): number {
  return Math.min(MAX_DOCUMENT_DAILY_LIMIT, Math.max(0, Math.trunc(value)));
}

/** Dữ liệu cũ/lạ trong JSON không được làm sập luồng đăng bài — rơi về mặc định. */
function readLimit(value: Prisma.JsonValue | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return clampLimit(value);
  }

  return DEFAULT_DOCUMENT_DAILY_LIMIT;
}
