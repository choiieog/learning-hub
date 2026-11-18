import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { DocumentStatus } from '../../common/enums/document-status.enum';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { StorageService } from '../../infra/storage/storage.service';
import { CreateSubjectDto } from './dto/create-subject.dto';

export interface SubjectSummary {
  id: string;
  code: string;
  name: string;
  description: string | null;
  documentCount: number;
}

const SUBJECT_SELECT = {
  id: true,
  code: true,
  name: true,
  description: true,
  _count: {
    select: {
      documents: {
        where: { status: DocumentStatus.APPROVED, deletedAt: null },
      },
    },
  },
} as const;

/**
 * Nghiệp vụ môn học.
 * - findAll + findOne (kèm số tài liệu đã duyệt) cho bộ lọc ở trang Tài liệu.
 * - create / remove cho admin; xoá là xoá mềm và bị chặn khi môn còn tài liệu.
 * - assertExists dùng nội bộ khi tạo tài liệu.
 */
@Injectable()
export class SubjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /** Danh sách môn học + số tài liệu đã duyệt của mỗi môn. */
  async findAll(_query?: PaginationQueryDto): Promise<SubjectSummary[]> {
    const subjects = await this.prisma.subject.findMany({
      where: { deletedAt: null },
      orderBy: [{ code: 'asc' }],
      select: SUBJECT_SELECT,
    });

    return subjects.map(toSummary);
  }

  async findOne(id: string): Promise<SubjectSummary> {
    const subject = await this.prisma.subject.findFirst({
      where: { id, deletedAt: null },
      select: SUBJECT_SELECT,
    });

    if (!subject) {
      throw new NotFoundException('Không tìm thấy môn học');
    }

    return toSummary(subject);
  }

  async create(dto: CreateSubjectDto): Promise<SubjectSummary> {
    const existing = await this.prisma.subject.findFirst({
      where: { code: dto.code },
      select: { id: true, deletedAt: true },
    });

    if (existing) {
      throw new ConflictException(
        existing.deletedAt
          ? 'Mã môn học này đã từng được dùng cho một môn đã xoá. Chọn mã khác.'
          : 'Mã môn học đã tồn tại',
      );
    }

    const subject = await this.prisma.subject.create({
      data: {
        code: dto.code,
        name: dto.name,
        description: dto.description?.trim() ? dto.description : null,
      },
      select: SUBJECT_SELECT,
    });

    return toSummary(subject);
  }

  /**
   * Xoá **thật** khỏi cơ sở dữ liệu (trước đây chỉ set `deletedAt` nên bảng vẫn còn row).
   *
   * - Chặn khi môn còn tài liệu chưa xoá (kể cả bài đang PENDING).
   * - Tài liệu đã xoá mềm vẫn giữ khoá ngoại tới môn, nên dọn chúng trước khi
   *   `delete`, nếu không Postgres chặn bằng FK. File của chúng đã bị xoá lúc xoá bài;
   *   lượt xoá ở đây chỉ dọn nốt file còn sót từ dữ liệu cũ.
   */
  async remove(id: string): Promise<{ id: string; message: string }> {
    const subject = await this.prisma.subject.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        code: true,
        documents: {
          select: {
            id: true,
            deletedAt: true,
            files: { select: { publicId: true } },
          },
        },
      },
    });

    if (!subject) {
      throw new NotFoundException('Không tìm thấy môn học');
    }

    const activeCount = subject.documents.filter(
      (document) => !document.deletedAt,
    ).length;

    if (activeCount > 0) {
      throw new ConflictException(
        `Không thể xoá môn ${subject.code}: còn ${activeCount} tài liệu đang dùng môn này.`,
      );
    }

    const documentIds = subject.documents.map((document) => document.id);
    const publicIds = subject.documents.flatMap((document) =>
      document.files.map((file) => file.publicId),
    );

    await this.prisma.$transaction(async (tx) => {
      // UploadedFile.documentId là SetNull nên phải xoá tay để không còn metadata mồ côi.
      await tx.uploadedFile.deleteMany({
        where: { documentId: { in: documentIds } },
      });
      await tx.document.deleteMany({ where: { id: { in: documentIds } } });
      await tx.subject.delete({ where: { id } });
    });

    await this.storage.removeMany(publicIds);

    return { id, message: `Đã xoá môn ${subject.code} khỏi cơ sở dữ liệu.` };
  }

  /** Dùng nội bộ khi tạo tài liệu: ném NotFoundException nếu môn không tồn tại. */
  async assertExists(id: string): Promise<void> {
    const subject = await this.prisma.subject.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });

    if (!subject) {
      throw new NotFoundException('Không tìm thấy môn học');
    }
  }
}

function toSummary(subject: {
  id: string;
  code: string;
  name: string;
  description: string | null;
  _count: { documents: number };
}): SubjectSummary {
  const { _count, ...rest } = subject;
  return { ...rest, documentCount: _count.documents };
}
