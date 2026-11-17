import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { DEFAULT_DOCUMENT_UPLOADS_ENABLED, SETTING_KEYS } from './settings.constants';

export interface SystemSettings {
  /** `false` = admin đang tạm khoá, sinh viên không đăng được bài mới. */
  uploadsEnabled: boolean;
  updatedAt: Date | null;
}

/**
 * Cấu hình hệ thống (bảng `SystemSetting`, key/value JSON).
 *
 * Hiện có một cấu hình: bật/tắt việc đăng tài liệu. `DocumentsService.create` đọc giá
 * trị này trước khi tạo bài nên admin đổi là áp dụng ngay, không cần restart. Đọc thẳng
 * DB mỗi lần đăng bài (một query nhỏ) để nhiều instance luôn thấy cùng cấu hình.
 */
@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings(): Promise<SystemSettings> {
    const row = await this.prisma.systemSetting.findUnique({
      where: { key: SETTING_KEYS.DOCUMENT_UPLOADS_ENABLED },
    });

    return {
      uploadsEnabled: readEnabled(row?.value),
      updatedAt: row?.updatedAt ?? null,
    };
  }

  /** Có đang cho phép đăng tài liệu không. */
  async isUploadEnabled(): Promise<boolean> {
    const row = await this.prisma.systemSetting.findUnique({
      where: { key: SETTING_KEYS.DOCUMENT_UPLOADS_ENABLED },
      select: { value: true },
    });

    return readEnabled(row?.value);
  }

  async updateSettings(input: { uploadsEnabled: boolean }): Promise<SystemSettings> {
    const row = await this.prisma.systemSetting.upsert({
      where: { key: SETTING_KEYS.DOCUMENT_UPLOADS_ENABLED },
      update: { value: input.uploadsEnabled },
      create: {
        key: SETTING_KEYS.DOCUMENT_UPLOADS_ENABLED,
        value: input.uploadsEnabled,
      },
    });

    return { uploadsEnabled: input.uploadsEnabled, updatedAt: row.updatedAt };
  }
}

/** Dữ liệu cũ/lạ trong JSON không được làm sập luồng đăng bài — rơi về mặc định. */
function readEnabled(value: Prisma.JsonValue | undefined): boolean {
  return typeof value === 'boolean' ? value : DEFAULT_DOCUMENT_UPLOADS_ENABLED;
}
