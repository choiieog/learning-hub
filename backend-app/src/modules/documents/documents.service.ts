import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from '../../common/dto/pagination-query.dto';
import { DocumentStatus } from '../../common/enums/document-status.enum';
import { Role } from '../../common/enums/role.enum';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { vietnamDayKey } from '../../common/utils/day-key.util';
import { ExpReason, Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { StorageService } from '../../infra/storage/storage.service';
import { EXP_RULES } from '../gamification/gamification.constants';
import { GamificationService } from '../gamification/gamification.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SettingsService } from '../settings/settings.service';
import {
  CreateDocumentDto,
  DocumentFileInputDto,
} from './dto/create-document.dto';
import { ListDocumentsQueryDto } from './dto/list-documents-query.dto';
import { ResubmitDocumentDto } from './dto/resubmit-document.dto';

const SORTABLE_FIELDS = ['createdAt', 'viewCount', 'ratingAvg'] as const;
const DOCUMENT_FILE_EXTENSIONS = ['pdf', 'docx', 'pptx'] as const;

/** Metadata file lấy từ `UploadedFile` để ghi vào `DocumentFile`. */
type ResolvedDocumentFile = {
  url: string;
  publicId: string;
  name: string;
  size: number;
  mimeType: string;
};
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
  author: {
    select: { id: true, fullName: true, avatarUrl: true, level: true },
  },
  files: {
    select: {
      url: true,
      publicId: true,
      name: true,
      size: true,
      mimeType: true,
    },
  },
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
  author: {
    id: string;
    fullName: string;
    avatarUrl: string | null;
    level: number;
  };
  files: {
    url: string;
    publicId: string | null;
    name: string;
    size: number;
    mimeType: string;
  }[];
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
    private readonly gamification: GamificationService,
    private readonly settings: SettingsService,
    private readonly storage: StorageService,
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
    const limit = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Number(query.limit) || DEFAULT_PAGE_SIZE),
    );

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

    // Tác giả nhận EXP cho lượt xem hợp lệ; tự xem bài mình không cộng để tránh farm EXP.
    if (viewCountedToday && !isOwner) {
      await this.gamification.award({
        userId: document.author.id,
        delta: EXP_RULES.VIEW,
        reason: ExpReason.VIEW,
        refId: documentId,
      });
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
  async create(
    authorId: string,
    dto: CreateDocumentDto,
  ): Promise<DocumentSummary> {
    const subject = await this.prisma.subject.findFirst({
      where: { id: dto.subjectId, deletedAt: null },
      select: { id: true },
    });

    if (!subject) {
      throw new BadRequestException('Môn học không tồn tại hoặc đã bị xoá.');
    }

    const files = await this.resolveFileInputs(dto.files, authorId);

    await this.assertWithinDailyLimit(authorId);

    // Tạo bài + đánh dấu file đã dùng trong cùng transaction: một file không thể
    // bị hai tài liệu cùng tham chiếu, và không có bài nào trỏ tới file "ma".
    const created = await this.prisma.$transaction(async (tx) => {
      const document = await tx.document.create({
        data: {
          title: dto.title.trim(),
          description: dto.description?.trim() || null,
          content: dto.content?.trim() || null,
          status: DocumentStatus.PENDING,
          subjectId: subject.id,
          authorId,
          files: { create: files },
        },
        select: DOCUMENT_SUMMARY_SELECT,
      });

      await this.markFilesUsed(tx, files, document.id, authorId);

      return document;
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
      throw new BadRequestException(
        'Chỉ gửi duyệt lại được tài liệu đã bị từ chối.',
      );
    }

    const subject = await this.prisma.subject.findFirst({
      where: { id: dto.subjectId, deletedAt: null },
      select: { id: true },
    });

    if (!subject) {
      throw new BadRequestException('Môn học không tồn tại hoặc đã bị xoá.');
    }

    const files = dto.files?.length
      ? await this.resolveFileInputs(dto.files, userId)
      : null;
    const previousFiles = files
      ? await this.prisma.documentFile.findMany({
          where: { documentId },
          select: { publicId: true },
        })
      : [];

    const updated = await this.prisma.$transaction(async (tx) => {
      const document = await tx.document.update({
        where: { id: documentId },
        data: {
          title: dto.title.trim(),
          description: dto.description?.trim() || null,
          content: dto.content?.trim() || null,
          subjectId: subject.id,
          status: DocumentStatus.PENDING,
          rejectReason: null,
          publishedAt: null,
          ...(files ? { files: { deleteMany: {}, create: files } } : {}),
        },
        select: DOCUMENT_DETAIL_SELECT,
      });

      if (files) {
        await this.markFilesUsed(tx, files, documentId, userId);
      }

      return document;
    });

    // File cũ bị thay thế: xoá khỏi storage để không còn tải được bằng URL cũ.
    if (files) {
      await this.deleteStoredFiles(previousFiles.map((file) => file.publicId));
    }

    return this.toDetail(updated, { viewCountedToday: false });
  }

  /**
   * DELETE /api/documents/:id — chủ bài xoá hẳn tài liệu của mình.
   *
   * Xoá cứng để `DocumentFile`, `DocumentView` và `Rating` bị dọn theo cascade khai báo
   * trong schema — không còn rating/bình luận mồ côi của bài đã xoá. Admin gỡ bài vi phạm
   * cũng xoá hẳn, kèm thông báo cho tác giả (`removeByAdmin`).
   * Người khác nhận 403 (bài đã duyệt vốn công khai nên không cần giấu sự tồn tại).
   */
  async removeOwn(documentId: string, userId: string): Promise<{ id: string }> {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, deletedAt: null },
      select: {
        id: true,
        authorId: true,
        files: { select: { publicId: true } },
      },
    });

    if (!document) {
      throw new NotFoundException('Không tìm thấy tài liệu');
    }

    if (document.authorId !== userId) {
      throw new ForbiddenException('Bạn chỉ có thể xoá tài liệu của mình.');
    }

    // Xoá cứng: cascade dọn DocumentFile, DocumentView và Rating của bài.
    await this.prisma.document.delete({ where: { id: documentId } });

    await this.deleteStoredFiles(document.files.map((file) => file.publicId));

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

    // Đổi trạng thái + thông báo + EXP cùng một transaction: hoặc cả ba cùng xảy ra,
    // hoặc không cái nào — tránh bài đã duyệt mà tác giả không có thông báo/EXP.
    const updated = await this.prisma.$transaction(async (tx) => {
      const document = await tx.document.update({
        where: { id: documentId },
        data: {
          status: DocumentStatus.APPROVED,
          publishedAt: new Date(),
          rejectReason: null,
        },
        select: DOCUMENT_DETAIL_SELECT,
      });

      await this.notifications.notifyApproved(
        {
          id: document.id,
          title: document.title,
          authorId: document.author.id,
        },
        tx,
      );

      await this.gamification.award(
        {
          userId: document.author.id,
          delta: EXP_RULES.DOCUMENT_APPROVED,
          reason: ExpReason.DOCUMENT_APPROVED,
          refId: document.id,
        },
        tx,
      );

      return document;
    });

    return this.toDetail(updated, { viewCountedToday: false });
  }

  /**
   * Từ chối tài liệu kèm lý do. Lý do được lưu và chỉ chủ bài / admin thấy
   * ở trang chi tiết, để tác giả biết cần sửa gì.
   */
  async reject(
    documentId: string,
    _adminId: string,
    reason: string,
  ): Promise<DocumentDetail> {
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

    const updated = await this.prisma.$transaction(async (tx) => {
      const document = await tx.document.update({
        where: { id: documentId },
        data: {
          status: DocumentStatus.REJECTED,
          rejectReason: reason.trim(),
          publishedAt: null,
        },
        select: DOCUMENT_DETAIL_SELECT,
      });

      await this.notifications.notifyRejected(
        {
          id: document.id,
          title: document.title,
          authorId: document.author.id,
        },
        reason,
        tx,
      );

      return document;
    });

    return this.toDetail(updated, { viewCountedToday: false });
  }

  /**
   * Admin gỡ bài vi phạm: xoá hẳn tài liệu (cascade dọn file, lượt xem, rating) và báo
   * cho tác giả. Thông báo nằm cùng transaction nên bài không thể biến mất mà tác giả
   * không biết; thông báo không kèm link vì bài đã không còn để mở.
   */
  async removeByAdmin(
    documentId: string,
    _adminId: string,
  ): Promise<{ id: string }> {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, deletedAt: null },
      select: {
        id: true,
        title: true,
        authorId: true,
        files: { select: { publicId: true } },
      },
    });

    if (!document) {
      throw new NotFoundException('Không tìm thấy tài liệu');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.document.delete({ where: { id: documentId } });

      // Tác giả cần biết bài của mình bị xoá, không chỉ biết là nó tự nhiên mất.
      await this.notifications.notifyDeleted(
        { id: document.id, title: document.title, authorId: document.authorId },
        tx,
      );
    });

    await this.deleteStoredFiles(document.files.map((file) => file.publicId));

    return { id: documentId };
  }

  /** Chặn khi sinh viên vượt giới hạn đăng bài/ngày do admin cấu hình (0 = không giới hạn). */
  private async assertWithinDailyLimit(authorId: string): Promise<void> {
    const limit = await this.settings.getDocumentDailyLimit();

    if (limit <= 0) {
      return;
    }

    const startOfToday = new Date(`${vietnamDayKey()}T00:00:00+07:00`);
    const createdToday = await this.prisma.document.count({
      where: { authorId, createdAt: { gte: startOfToday } },
    });

    if (createdToday >= limit) {
      throw new HttpException(
        `Bạn đã đăng ${createdToday}/${limit} tài liệu hôm nay. Vui lòng quay lại vào ngày mai.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /**
   * Client chỉ gửi `publicId`; metadata (url/name/size/mimeType) đọc từ `UploadedFile`
   * nên không thể bịa. `markFilesUsed` chặn file đã gắn tài liệu khác, kể cả khi hai
   * request đồng thời cùng tham chiếu một file.
   */
  private async resolveFileInputs(
    files: DocumentFileInputDto[],
    ownerId: string,
  ): Promise<ResolvedDocumentFile[]> {
    const resolved: ResolvedDocumentFile[] = [];

    for (const { publicId } of files) {
      const record = await this.prisma.uploadedFile.findFirst({
        where: { publicId, ownerId },
        select: {
          url: true,
          publicId: true,
          name: true,
          size: true,
          mimeType: true,
        },
      });

      if (!record) {
        throw new BadRequestException(
          `File ${publicId} không tồn tại hoặc không phải do bạn tải lên.`,
        );
      }

      const extension = record.name.split('.').pop()?.toLowerCase() ?? '';
      if (
        !DOCUMENT_FILE_EXTENSIONS.includes(extension as 'pdf' | 'docx' | 'pptx')
      ) {
        throw new BadRequestException(
          `"${record.name}": chỉ nhận file PDF, DOCX, PPTX.`,
        );
      }

      resolved.push(record);
    }

    return resolved;
  }

  /** Gắn file vào tài liệu; nếu file vừa bị dùng ở request khác thì rollback cả transaction. */
  private async markFilesUsed(
    tx: Prisma.TransactionClient,
    files: { publicId: string }[],
    documentId: string,
    ownerId: string,
  ): Promise<void> {
    if (files.length === 0) {
      return;
    }

    const publicIds = files.map((file) => file.publicId);
    const { count } = await tx.uploadedFile.updateMany({
      where: { publicId: { in: publicIds }, ownerId, documentId: null },
      data: { documentId },
    });

    if (count !== publicIds.length) {
      throw new BadRequestException(
        'Có file vừa được dùng cho tài liệu khác. Vui lòng tải lại file và thử lại.',
      );
    }
  }

  /** Xoá file khỏi storage (best-effort, xem `StorageService.removeMany`) và row `UploadedFile`. */
  private async deleteStoredFiles(publicIds: (string | null)[]): Promise<void> {
    await this.storage.removeMany(publicIds);

    const ids = publicIds.filter((publicId): publicId is string =>
      Boolean(publicId),
    );

    if (ids.length > 0) {
      await this.prisma.uploadedFile.deleteMany({
        where: { publicId: { in: ids } },
      });
    }
  }

  /** Gom document đã select thành payload chi tiết; ẩn rejectReason với người không liên quan. */
  private toDetail(
    document: Prisma.DocumentGetPayload<{
      select: typeof DOCUMENT_DETAIL_SELECT;
    }>,
    options: {
      viewCountedToday: boolean;
      viewCount?: number;
      hideRejectReason?: boolean;
    },
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
  private async listDocuments(
    query: ListDocumentsQueryDto,
  ): Promise<PaginatedDocuments> {
    const page = Math.max(1, Number(query.page) || DEFAULT_PAGE);
    const limit = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Number(query.limit) || DEFAULT_PAGE_SIZE),
    );

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
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

/** Whitelist field + hướng sắp xếp; thêm `id` để phân trang ổn định. */
function parseSort(sort?: string): Prisma.DocumentOrderByWithRelationInput[] {
  const [field, direction] = (sort ?? 'createdAt:desc').split(':');
  const safeField: SortableField = SORTABLE_FIELDS.includes(
    field as SortableField,
  )
    ? (field as SortableField)
    : 'createdAt';
  const safeDirection: Prisma.SortOrder = direction === 'asc' ? 'asc' : 'desc';

  return [{ [safeField]: safeDirection }, { id: 'asc' }];
}
