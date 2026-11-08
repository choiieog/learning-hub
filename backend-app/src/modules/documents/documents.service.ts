import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from '../../common/dto/pagination-query.dto';
import { UPLOAD_URL_PREFIX } from '../../common/constants/upload.constants';
import { DocumentStatus } from '../../common/enums/document-status.enum';
import { Role } from '../../common/enums/role.enum';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { vietnamDayKey } from '../../common/utils/day-key.util';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateDocumentDto, DocumentFileInputDto } from './dto/create-document.dto';
import { ListDocumentsQueryDto } from './dto/list-documents-query.dto';
import { ResubmitDocumentDto } from './dto/resubmit-document.dto';

const SORTABLE_FIELDS = ['createdAt', 'viewCount', 'ratingAvg'] as const;
const DOCUMENT_FILE_EXTENSIONS = ['pdf', 'docx', 'pptx'] as const;
type SortableField = (typeof SORTABLE_FIELDS)[number];

/** Chỉ các cột cần cho danh sách — không trả deletedAt/rejectReason ra ngoài. */
const DOCUMENT_SUMMARY_SELECT = {
  id: true,
  title: true,
  description: true,
  status: true,
  viewCount: true,
  ratingAvg: true,
  ratingCount: true,
  createdAt: true,
  publishedAt: true,
  subject: { select: { id: true, code: true, name: true } },
  author: { select: { id: true, fullName: true, avatarUrl: true, level: true } },
  files: { select: { url: true, publicId: true, name: true, size: true, mimeType: true } },
} satisfies Prisma.DocumentSelect;

export interface DocumentSummary {
  id: string;
  title: string;
  description: string | null;
  status: DocumentStatus;
  viewCount: number;
  ratingAvg: number;
  ratingCount: number;
  createdAt: Date;
  publishedAt: Date | null;
  subject: { id: string; code: string; name: string };
  author: { id: string; fullName: string; avatarUrl: string | null; level: number };
  files: { url: string; publicId: string | null; name: string; size: number; mimeType: string }[];
}

export interface DocumentDetail extends DocumentSummary {
  content: string | null;
  /** Chỉ trả cho chủ bài hoặc admin, người khác nhận null. */
  rejectReason: string | null;
  /** true khi lượt xem lần này được tính; false khi hôm nay đã tính rồi. */
  viewCountedToday: boolean;
}

/** Tài liệu của chính người dùng — kèm lý do từ chối để hiển thị ngay trên thẻ. */
export interface MyDocumentSummary extends DocumentSummary {
  rejectReason: string | null;
}

export interface PaginatedDocuments<T = DocumentSummary> {
  items: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

/** Như danh sách nhưng thêm nội dung + lý do từ chối (chỉ cho chủ bài/admin). */
const DOCUMENT_DETAIL_SELECT = {
  ...DOCUMENT_SUMMARY_SELECT,
  content: true,
  rejectReason: true,
} satisfies Prisma.DocumentSelect;

/** Danh sách "Đã chia sẻ": chủ bài cần thấy lý do từ chối nên select thêm cột này. */
const MY_DOCUMENT_SELECT = {
  ...DOCUMENT_SUMMARY_SELECT,
  rejectReason: true,
} satisfies Prisma.DocumentSelect;

/**
 * Nghiệp vụ tài liệu.
 *
 * Đã làm: findAll (danh sách công khai + tìm kiếm/lọc/phân trang),
 *   findMine (tài liệu của tôi, mọi trạng thái + lý do từ chối),
 *   findOneAndRegisterView (chi tiết + đếm lượt xem, mỗi người 1 lượt/ngày),
 *   create (đăng tài liệu → PENDING chờ duyệt),
 *   resubmit (sửa bài bị từ chối rồi đưa lại hàng chờ duyệt),
 *   removeOwn (sinh viên tự xoá mềm tài liệu của mình).
 */
@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /** GET /api/documents — chỉ tài liệu APPROVED, chưa xóa. */
  findAll(query: ListDocumentsQueryDto): Promise<PaginatedDocuments> {
    return this.listDocuments({ ...query, status: DocumentStatus.APPROVED });
  }

  /**
   * GET /api/documents/mine — mọi tài liệu của chính người dùng, không lọc theo trạng thái.
   * Khác danh sách công khai ở chỗ trả thêm rejectReason để hiển thị lý do bị từ chối.
   */
  async findMine(
    authorId: string,
    query: ListDocumentsQueryDto,
  ): Promise<PaginatedDocuments<MyDocumentSummary>> {
    const page = Math.max(1, Number(query.page) || DEFAULT_PAGE);
    const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(query.limit) || DEFAULT_PAGE_SIZE));

    const where: Prisma.DocumentWhereInput = { authorId, deletedAt: null };
    if (query.status) {
      where.status = query.status;
    }

    const [total, items] = await this.prisma.$transaction([
      this.prisma.document.count({ where }),
      this.prisma.document.findMany({
        where,
        orderBy: parseSort(query.sort),
        skip: (page - 1) * limit,
        take: limit,
        select: MY_DOCUMENT_SELECT,
      }),
    ]);

    return {
      items: items as MyDocumentSummary[],
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Chi tiết tài liệu + ghi nhận lượt xem.
   *
   * Chống spam bằng bảng DocumentView với unique (documentId, viewerKey, dayKey):
   * một người chỉ được tính 1 lượt xem / tài liệu / ngày (dayKey theo giờ Việt Nam).
   * Tài liệu chưa duyệt chỉ chủ bài và admin xem được; người khác nhận 404
   * thay vì 403 để không lộ sự tồn tại của tài liệu.
   */
  async findOneAndRegisterView(
    documentId: string,
    viewer: AuthenticatedUser,
  ): Promise<DocumentDetail> {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, deletedAt: null },
      select: DOCUMENT_DETAIL_SELECT,
    });

    if (!document) {
      throw new NotFoundException('Không tìm thấy tài liệu');
    }

    const isOwner = document.author.id === viewer.id;
    const isAdmin = viewer.role === Role.ADMIN;

    if (document.status !== DocumentStatus.APPROVED && !isOwner && !isAdmin) {
      throw new NotFoundException('Không tìm thấy tài liệu');
    }

    let viewCount = document.viewCount;
    let viewCountedToday = false;

    // Bài chờ duyệt / bị từ chối không được tính lượt xem.
    if (document.status === DocumentStatus.APPROVED) {
      const dayKey = vietnamDayKey();

      try {
        const [, updated] = await this.prisma.$transaction([
          this.prisma.documentView.create({
            data: { documentId, viewerKey: viewer.id, dayKey },
          }),
          this.prisma.document.update({
            where: { id: documentId },
            data: { viewCount: { increment: 1 } },
            select: { viewCount: true },
          }),
        ]);

        viewCount = updated.viewCount;
        viewCountedToday = true;
      } catch (error) {
        // Đụng unique (documentId, viewerKey, dayKey): hôm nay đã tính lượt của người này.
        if (!isUniqueConstraintError(error)) {
          throw error;
        }
      }
    }

    return this.toDetail(document, {
      viewCountedToday,
      viewCount,
      hideRejectReason: !(isOwner || isAdmin),
    });
  }

  /**
   * Đăng tài liệu: luôn vào PENDING, chỉ chủ bài và admin thấy cho tới khi duyệt.
   * File phải do POST /api/uploads trả về để không nhận URL lạ trong body.
   */
  async create(authorId: string, dto: CreateDocumentDto): Promise<DocumentSummary> {
    const subject = await this.prisma.subject.findFirst({
      where: { id: dto.subjectId, deletedAt: null },
      select: { id: true },
    });

    if (!subject) {
      throw new BadRequestException('Môn học không tồn tại hoặc đã bị xoá.');
    }

    for (const file of dto.files) {
      this.assertFileInput(file);
    }

    const created = await this.prisma.document.create({
      data: {
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        content: dto.content?.trim() || null,
        status: DocumentStatus.PENDING,
        subjectId: subject.id,
        authorId,
        files: {
          create: dto.files.map((file) => ({
            url: file.url,
            publicId: file.publicId ?? null,
            name: file.name,
            size: file.size,
            mimeType: file.mimeType,
          })),
        },
      },
      select: DOCUMENT_SUMMARY_SELECT,
    });

    return created as DocumentSummary;
  }

  /**
   * PATCH /api/documents/:id — chủ bài sửa nội dung bài bị từ chối rồi gửi duyệt lại.
   * Bài quay về PENDING, xoá lý do từ chối cũ và publishedAt để admin xét lại từ đầu.
   * `files` bỏ trống thì giữ file cũ; gửi lên thì thay toàn bộ file đính kèm.
   */
  async resubmit(
    documentId: string,
    userId: string,
    dto: ResubmitDocumentDto,
  ): Promise<DocumentDetail> {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, deletedAt: null },
      select: { id: true, authorId: true, status: true },
    });

    if (!document) {
      throw new NotFoundException('Không tìm thấy tài liệu');
    }

    if (document.authorId !== userId) {
      throw new ForbiddenException('Bạn chỉ có thể sửa tài liệu của mình.');
    }

    if (document.status !== DocumentStatus.REJECTED) {
      throw new BadRequestException('Chỉ gửi duyệt lại được tài liệu đã bị từ chối.');
    }

    const subject = await this.prisma.subject.findFirst({
      where: { id: dto.subjectId, deletedAt: null },
      select: { id: true },
    });

    if (!subject) {
      throw new BadRequestException('Môn học không tồn tại hoặc đã bị xoá.');
    }

    for (const file of dto.files ?? []) {
      this.assertFileInput(file);
    }

    const files = dto.files?.length ? dto.files : null;

    const updated = await this.prisma.document.update({
      where: { id: documentId },
      data: {
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        content: dto.content?.trim() || null,
        subjectId: subject.id,
        status: DocumentStatus.PENDING,
        rejectReason: null,
        publishedAt: null,
        ...(files
          ? {
              files: {
                deleteMany: {},
                create: files.map((file) => ({
                  url: file.url,
                  publicId: file.publicId ?? null,
                  name: file.name,
                  size: file.size,
                  mimeType: file.mimeType,
                })),
              },
            }
          : {}),
      },
      select: DOCUMENT_DETAIL_SELECT,
    });

    return this.toDetail(updated, { viewCountedToday: false });
  }

  /**
   * DELETE /api/documents/:id — chủ bài xoá mềm tài liệu của mình.
   * Xoá mềm để bài biến mất khỏi mọi danh sách nhưng vẫn còn dữ liệu đối soát.
   * Người khác nhận 403 (bài đã duyệt vốn công khai nên không cần giấu sự tồn tại).
   */
  async removeOwn(documentId: string, userId: string): Promise<{ id: string }> {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, deletedAt: null },
      select: { id: true, authorId: true },
    });

    if (!document) {
      throw new NotFoundException('Không tìm thấy tài liệu');
    }

    if (document.authorId !== userId) {
      throw new ForbiddenException('Bạn chỉ có thể xoá tài liệu của mình.');
    }

    await this.prisma.document.update({
      where: { id: documentId },
      data: { deletedAt: new Date() },
    });

    return { id: documentId };
  }

  /** Hàng chờ duyệt của admin, lọc theo status. */
  findForModeration(query: ListDocumentsQueryDto): Promise<PaginatedDocuments> {
    return this.listDocuments({ ...query, status: query.status });
  }

  /**
   * Duyệt tài liệu: PENDING → APPROVED, gán publishedAt để xuất hiện trong danh sách công khai.
   * Duyệt lại bài đã duyệt trả 400 để tránh đổi publishedAt ngoài ý muốn.
   */
  async approve(documentId: string, _adminId: string): Promise<DocumentDetail> {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, deletedAt: null },
      select: { id: true, status: true },
    });

    if (!document) {
      throw new NotFoundException('Không tìm thấy tài liệu');
    }

    if (document.status === DocumentStatus.APPROVED) {
      throw new BadRequestException('Tài liệu này đã được duyệt.');
    }

    const updated = await this.prisma.document.update({
      where: { id: documentId },
      data: {
        status: DocumentStatus.APPROVED,
        publishedAt: new Date(),
        rejectReason: null,
      },
      select: DOCUMENT_DETAIL_SELECT,
    });

    await this.notifications.notifyApproved({
      id: updated.id,
      title: updated.title,
      authorId: updated.author.id,
    });

    return this.toDetail(updated, { viewCountedToday: false });
  }

  /**
   * Từ chối tài liệu kèm lý do. Lý do được lưu và chỉ chủ bài / admin thấy
   * ở trang chi tiết, để tác giả biết cần sửa gì.
   */
  async reject(documentId: string, _adminId: string, reason: string): Promise<DocumentDetail> {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, deletedAt: null },
      select: { id: true, status: true },
    });

    if (!document) {
      throw new NotFoundException('Không tìm thấy tài liệu');
    }

    if (document.status === DocumentStatus.REJECTED) {
      throw new BadRequestException('Tài liệu này đã bị từ chối.');
    }

    const updated = await this.prisma.document.update({
      where: { id: documentId },
      data: {
        status: DocumentStatus.REJECTED,
        rejectReason: reason.trim(),
        publishedAt: null,
      },
      select: DOCUMENT_DETAIL_SELECT,
    });

    await this.notifications.notifyRejected(
      { id: updated.id, title: updated.title, authorId: updated.author.id },
      reason,
    );

    return this.toDetail(updated, { viewCountedToday: false });
  }

  /** Xoá mềm tài liệu vi phạm — biến mất khỏi mọi danh sách nhưng giữ dữ liệu để đối soát. */
  async removeByAdmin(documentId: string, _adminId: string): Promise<{ id: string }> {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, deletedAt: null },
      select: { id: true },
    });

    if (!document) {
      throw new NotFoundException('Không tìm thấy tài liệu');
    }

    await this.prisma.document.update({
      where: { id: documentId },
      data: { deletedAt: new Date() },
    });

    return { id: documentId };
  }

  /** File phải do POST /api/uploads trả về và đúng định dạng cho phép. */
  private assertFileInput(file: DocumentFileInputDto): void {
    const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!DOCUMENT_FILE_EXTENSIONS.includes(extension as 'pdf' | 'docx' | 'pptx')) {
      throw new BadRequestException(`"${file.name}": chỉ nhận file PDF, DOCX, PPTX.`);
    }

    if (!file.url.startsWith(`${UPLOAD_URL_PREFIX}/`)) {
      throw new BadRequestException(`"${file.name}": file phải được tải lên qua /api/uploads.`);
    }
  }

  /** Gom document đã select thành payload chi tiết; ẩn rejectReason với người không liên quan. */
  private toDetail(
    document: Prisma.DocumentGetPayload<{ select: typeof DOCUMENT_DETAIL_SELECT }>,
    options: { viewCountedToday: boolean; viewCount?: number; hideRejectReason?: boolean },
  ): DocumentDetail {
    const { content, rejectReason, ...summary } = document;

    return {
      ...summary,
      // Prisma trả enum sinh tự động, ép về enum dùng chung của API.
      status: document.status as DocumentStatus,
      content,
      viewCount: options.viewCount ?? document.viewCount,
      rejectReason: options.hideRejectReason ? null : rejectReason,
      viewCountedToday: options.viewCountedToday,
    };
  }

  /** Truy vấn dùng chung cho danh sách công khai và hàng chờ duyệt. */
  private async listDocuments(query: ListDocumentsQueryDto): Promise<PaginatedDocuments> {
    const page = Math.max(1, Number(query.page) || DEFAULT_PAGE);
    const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(query.limit) || DEFAULT_PAGE_SIZE));

    const where: Prisma.DocumentWhereInput = { deletedAt: null };
    if (query.status) {
      where.status = query.status;
    }

    const keyword = query.keyword?.trim();
    if (keyword) {
      where.OR = [
        { title: { contains: keyword, mode: 'insensitive' } },
        { description: { contains: keyword, mode: 'insensitive' } },
      ];
    }

    if (query.subjectIds?.length) {
      where.subjectId = { in: query.subjectIds };
    }

    if (query.authorIds?.length) {
      where.authorId = { in: query.authorIds };
    }

    if (query.fileTypes?.length) {
      where.files = {
        some: {
          OR: query.fileTypes.map((type) => ({
            name: { endsWith: `.${type}`, mode: 'insensitive' },
          })),
        },
      };
    }

    if (typeof query.minRating === 'number' && query.minRating > 0) {
      where.ratingAvg = { gte: query.minRating };
    }

    const orderBy = parseSort(query.sort);
    const skip = (page - 1) * limit;

    const [total, items] = await this.prisma.$transaction([
      this.prisma.document.count({ where }),
      this.prisma.document.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        select: DOCUMENT_SUMMARY_SELECT,
      }),
    ]);

    return {
      items: items as DocumentSummary[],
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/** Whitelist field + hướng sắp xếp; thêm `id` để phân trang ổn định. */
function parseSort(sort?: string): Prisma.DocumentOrderByWithRelationInput[] {
  const [field, direction] = (sort ?? 'createdAt:desc').split(':');
  const safeField: SortableField = SORTABLE_FIELDS.includes(field as SortableField)
    ? (field as SortableField)
    : 'createdAt';
  const safeDirection: Prisma.SortOrder = direction === 'asc' ? 'asc' : 'desc';

  return [{ [safeField]: safeDirection }, { id: 'asc' }];
}
