import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { DocumentStatus } from '../../common/enums/document-status.enum';
import { PrismaService } from '../../infra/prisma/prisma.service';
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
      documents: { where: { status: DocumentStatus.APPROVED, deletedAt: null } },
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
  constructor(private readonly prisma: PrismaService) {}

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

  /** Xoá mềm; chặn khi môn còn tài liệu (kể cả bài đang chờ duyệt / bị từ chối). */
  async remove(id: string): Promise<{ id: string; message: string }> {
    const subject = await this.prisma.subject.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        code: true,
        _count: { select: { documents: { where: { deletedAt: null } } } },
      },
    });

    if (!subject) {
      throw new NotFoundException('Không tìm thấy môn học');
    }

    if (subject._count.documents > 0) {
      throw new ConflictException(
        `Không thể xoá môn ${subject.code}: còn ${subject._count.documents} tài liệu đang dùng môn này.`,
      );
    }

    await this.prisma.subject.update({ where: { id }, data: { deletedAt: new Date() } });

    return { id, message: `Đã xoá môn ${subject.code}.` };
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
