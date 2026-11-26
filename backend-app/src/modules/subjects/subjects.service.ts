import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { DocumentStatus } from '../../common/enums/document-status.enum';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { CreateSubjectDto } from './dto/create-subject.dto';

/** Môn học ở API công khai; documentCount chỉ tính tài liệu đã duyệt. */
export interface SubjectSummary {
  id: string;
  code: string;
  name: string;
  documentCount: number;
}

/** Môn học trong danh mục admin; documentCount tính mọi trạng thái để khớp điều kiện xoá. */
export interface AdminSubjectSummary {
  id: string;
  code: string;
  name: string;
  documentCount: number;
}

const PUBLIC_SUBJECT_SELECT = {
  id: true,
  code: true,
  name: true,
  _count: {
    select: {
      documents: {
        where: { status: DocumentStatus.APPROVED },
      },
    },
  },
} as const;

const ADMIN_SUBJECT_SELECT = {
  id: true,
  code: true,
  name: true,
  _count: { select: { documents: true } },
} as const;

/**
 * Nghiệp vụ môn học.
 * - findAll + findOne (kèm số tài liệu đã duyệt) cho bộ lọc ở trang Tài liệu.
 * - create / remove cho admin; xoá cứng và bị chặn khi môn còn tài liệu.
 * - assertExists dùng nội bộ khi tạo tài liệu.
 */
@Injectable()
export class SubjectsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Danh sách môn học + số tài liệu đã duyệt của mỗi môn. */
  async findAll(_query?: PaginationQueryDto): Promise<SubjectSummary[]> {
    const subjects = await this.prisma.subject.findMany({
      orderBy: [{ code: 'asc' }],
      select: PUBLIC_SUBJECT_SELECT,
    });

    return subjects.map(toSummary);
  }

  /**
   * Danh mục cho admin: đếm mọi tài liệu, kể cả PENDING, để trạng thái và nút xoá
   * khớp đúng điều kiện chặn xoá ở remove(). Bộ lọc công khai vẫn dùng findAll()
   * với số tài liệu đã duyệt.
   */
  async findAllForAdmin(): Promise<AdminSubjectSummary[]> {
    const subjects = await this.prisma.subject.findMany({
      orderBy: [{ code: 'asc' }],
      select: ADMIN_SUBJECT_SELECT,
    });

    return subjects.map(toSummary);
  }

  async findOne(id: string): Promise<SubjectSummary> {
    const subject = await this.prisma.subject.findFirst({
      where: { id },
      select: PUBLIC_SUBJECT_SELECT,
    });

    if (!subject) {
      throw new NotFoundException('Không tìm thấy môn học');
    }

    return toSummary(subject);
  }

  async create(dto: CreateSubjectDto): Promise<AdminSubjectSummary> {
    const existing = await this.prisma.subject.findUnique({
      where: { code: dto.code },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('Mã môn học đã tồn tại');
    }

    const subject = await this.prisma.subject.create({
      data: { code: dto.code, name: dto.name },
      select: ADMIN_SUBJECT_SELECT,
    });

    return toSummary(subject);
  }

  /**
   * Xoá cứng khỏi cơ sở dữ liệu; chặn khi môn còn tài liệu (kể cả bài đang PENDING).
   * File của tài liệu đã bị xoá cùng lúc xoá bài, nên ở đây chỉ còn dọn metadata.
   */
  async remove(id: string): Promise<{ id: string; message: string }> {
    const subject = await this.prisma.subject.findFirst({
      where: { id },
      select: { id: true, code: true, _count: { select: { documents: true } } },
    });

    if (!subject) {
      throw new NotFoundException('Không tìm thấy môn học');
    }

    if (subject._count.documents > 0) {
      throw new ConflictException(
        `Không thể xoá môn ${subject.code}: còn ${subject._count.documents} tài liệu đang dùng môn này.`,
      );
    }

    await this.prisma.subject.delete({ where: { id } });

    return { id, message: `Đã xoá môn ${subject.code} khỏi cơ sở dữ liệu.` };
  }

  /** Dùng nội bộ khi tạo tài liệu: ném NotFoundException nếu môn không tồn tại. */
  async assertExists(id: string): Promise<void> {
    const subject = await this.prisma.subject.findFirst({
      where: { id },
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
  _count: { documents: number };
}): SubjectSummary {
  const { _count, ...rest } = subject;
  return { ...rest, documentCount: _count.documents };
}
