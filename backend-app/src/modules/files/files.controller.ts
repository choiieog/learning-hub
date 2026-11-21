import {
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request, Response } from 'express';
import { stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import {
  MIME_BY_EXTENSION,
  UPLOAD_FOLDERS,
  UPLOAD_URL_PREFIX,
  type UploadFolder,
} from '../../common/constants/upload.constants';
import { Role } from '../../common/enums/role.enum';
import configuration from '../../config/configuration';
import { PrismaService } from '../../infra/prisma/prisma.service';

/** Tên tệp do server sinh (uuid + phần mở rộng); chỉ nhận đúng dạng này, không nhận đường dẫn. */
const FILE_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*\.[a-z0-9]+$/;

interface OptionalUser {
  id: string;
  role: Role;
}

/**
 * Phục vụ tệp đã upload: `GET /api/files/<folder>/<name>`.
 *
 * Trước đây thư mục upload được mount tĩnh, nên bất kỳ ai biết link đều tải được tệp
 * của bài còn `PENDING`. Route này thay thế mount tĩnh và kiểm tra quyền:
 * - `avatars/` → công khai (ảnh hồ sơ hiện trên danh sách/điểm xếp hạng);
 * - `documents/` → phải đăng nhập mới tải được; riêng bài `PENDING` chỉ tác giả và admin,
 *   xác thực bằng access token (trang `/viewer` tải tệp qua XHR nên có token).
 */
@Controller('files')
export class FilesController {
  private readonly uploadRoot = resolve(process.env.UPLOAD_DIR ?? './uploads');

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  @Get(':folder/:name')
  async serve(
    @Param('folder') folder: string,
    @Param('name') name: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    if (!UPLOAD_FOLDERS.includes(folder as UploadFolder) || !FILE_NAME_PATTERN.test(name)) {
      throw new NotFoundException('Không tìm thấy tệp');
    }

    // `name` đã khớp pattern nên không thể chứa `..`; vẫn kiểm lại để chắc chắn không thoát UPLOAD_DIR.
    const absolutePath = resolve(this.uploadRoot, folder, name);

    if (!absolutePath.startsWith(`${this.uploadRoot}${sep}`)) {
      throw new NotFoundException('Không tìm thấy tệp');
    }

    try {
      const info = await stat(absolutePath);

      if (!info.isFile()) {
        throw new NotFoundException('Không tìm thấy tệp');
      }
    } catch {
      throw new NotFoundException('Không tìm thấy tệp');
    }

    const mimeType = MIME_BY_EXTENSION[extname(name).slice(1).toLowerCase()] ?? null;

    if (!mimeType) {
      throw new NotFoundException('Không tìm thấy tệp');
    }

    const isDocument = folder === 'documents';

    if (isDocument) {
      await this.assertCanReadDocument(name, request);
    }

    response.setHeader('Content-Type', mimeType);
    response.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(name)}`);
    // Tài liệu chỉ dành cho người đã đăng nhập: không cho proxy/browser giữ bản sao dùng chung.
    response.setHeader('Cache-Control', isDocument ? 'private, no-store' : 'public, max-age=300');
    response.sendFile(absolutePath);
  }

  /**
   * Mọi tệp tài liệu đều cần đăng nhập; bài chưa duyệt thì chỉ tác giả và admin.
   */
  private async assertCanReadDocument(name: string, request: Request): Promise<void> {
    const file = await this.prisma.documentFile.findFirst({
      where: { url: `${UPLOAD_URL_PREFIX}/documents/${name}` },
      select: {
        document: { select: { status: true, authorId: true } },
      },
    });

    if (!file) {
      throw new NotFoundException('Không tìm thấy tệp');
    }

    const user = await this.optionalUser(request);

    if (!user) {
      throw new UnauthorizedException('Bạn cần đăng nhập để xem tệp này');
    }

    if (file.document.status === 'APPROVED') {
      return;
    }

    if (user.role !== Role.ADMIN && user.id !== file.document.authorId) {
      throw new ForbiddenException('Tệp đang chờ duyệt nên chỉ tác giả và quản trị viên xem được');
    }
  }

  /** Đọc Bearer token nếu có; token thiếu/hết hạn thì coi như khách, không ném lỗi. */
  private async optionalUser(request: Request): Promise<OptionalUser | null> {
    const header = request.headers.authorization;

    if (!header?.startsWith('Bearer ')) {
      return null;
    }

    const token = header.slice('Bearer '.length).trim();

    if (!token) {
      return null;
    }

    let userId: string;

    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; type?: string }>(token, {
        secret: configuration().jwt.accessSecret,
      });

      if (payload.type === 'refresh') {
        return null;
      }

      userId = payload.sub;
    } catch {
      return null;
    }

    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true, role: true, status: true },
    });

    if (!user || user.status === 'BANNED') {
      return null;
    }

    return { id: user.id, role: user.role as Role };
  }
}
