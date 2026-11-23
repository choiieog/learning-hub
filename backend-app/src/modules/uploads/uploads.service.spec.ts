import { describe, expect, it, jest } from '@jest/globals';
import { PayloadTooLargeException } from '@nestjs/common';
import type { UploadFolder } from '../../common/constants/upload.constants';
import type { PrismaService } from '../../infra/prisma/prisma.service';
import type { StorageService } from '../../infra/storage/storage.service';
import type { StorageUploadInput } from '../../infra/storage/storage.types';
import type { UploadedFileLike } from './uploads.controller';
import { UploadsService } from './uploads.service';

const PDF_BYTES = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n%%EOF\n', 'latin1');
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

/**
 * ZIP tối giản đủ để `readZipEntryNames` đọc được: chữ ký ZIP + các central directory
 * record + EOCD. Không có local header vì bộ kiểm tra chỉ đọc tên entry.
 */
function zipWithEntries(names: string[]): Buffer {
  const parts: Buffer[] = [Buffer.from([0x50, 0x4b, 0x03, 0x04])];

  for (const name of names) {
    const nameBytes = Buffer.from(name, 'utf8');
    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50, 0);
    record.writeUInt16LE(nameBytes.length, 28);
    parts.push(record, nameBytes);
  }

  const centralOffset = parts[0].length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(names.length, 10);
  eocd.writeUInt32LE(centralOffset, 16);
  parts.push(eocd);

  return Buffer.concat(parts);
}

function file(
  overrides: Partial<UploadedFileLike> & { buffer: Buffer },
): UploadedFileLike {
  return {
    originalname: 'tai-lieu.pdf',
    mimetype: 'application/pdf',
    size: overrides.buffer.length,
    ...overrides,
  };
}

function setup() {
  const storage = {
    name: 'fake',
    upload: jest.fn(
      async (input: StorageUploadInput, folder: UploadFolder) => ({
        url: `/api/files/${folder}/stored.pdf`,
        publicId: `${folder}/stored.pdf`,
        name: input.originalName,
        size: input.buffer.length,
        mimeType: input.mimeType,
      }),
    ),
  };
  const prisma = {
    uploadedFile: {
      create: jest.fn(async (_args: { data: Record<string, unknown> }) => undefined),
    },
  };
  const service = new UploadsService(
    storage as unknown as StorageService,
    prisma as unknown as PrismaService,
  );

  return { service, storage, prisma };
}

describe('UploadsService', () => {
  it('chặn khi thiếu file hoặc sai thư mục', async () => {
    const { service, storage } = setup();

    await expect(service.upload(undefined, 'documents', 'u1')).rejects.toThrow(
      'Thiếu file',
    );
    await expect(
      service.upload(file({ buffer: PDF_BYTES }), 'khong-hop-le', 'u1'),
    ).rejects.toThrow('Thư mục không hợp lệ');

    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('chặn đuôi lạ và MIME không khớp đuôi', async () => {
    const { service } = setup();

    await expect(
      service.upload(
        file({ buffer: PDF_BYTES, originalname: 'ghi-chu.txt', mimetype: 'text/plain' }),
        'documents',
        'u1',
      ),
    ).rejects.toThrow('Chỉ nhận file PDF');

    await expect(
      service.upload(
        file({ buffer: PDF_BYTES, mimetype: 'image/png' }),
        'documents',
        'u1',
      ),
    ).rejects.toThrow('không khớp định dạng .pdf');
  });

  it('chặn file đổi đuôi: đuôi và MIME đúng nhưng chữ ký nhị phân sai', async () => {
    const { service, storage } = setup();

    await expect(
      service.upload(file({ buffer: PNG_BYTES }), 'documents', 'u1'),
    ).rejects.toThrow('không phải PDF thật');
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('chỉ nhận DOCX có entry word/ bên trong container', async () => {
    const { service } = setup();
    const docx = {
      originalname: 'bai.docx',
      mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };

    await expect(
      service.upload(
        file({ ...docx, buffer: zipWithEntries(['[Content_Types].xml', 'mimetype']) }),
        'documents',
        'u1',
      ),
    ).rejects.toThrow('không phải DOCX thật');

    const stored = await service.upload(
      file({
        ...docx,
        buffer: zipWithEntries(['[Content_Types].xml', 'word/document.xml']),
      }),
      'documents',
      'u1',
    );
    expect(stored.mimeType).toBe(docx.mimetype);
  });

  it('lưu file và ghi metadata vào UploadedFile', async () => {
    const { service, storage, prisma } = setup();

    const stored = await service.upload(file({ buffer: PDF_BYTES }), 'documents', 'u1');

    expect(storage.upload).toHaveBeenCalledWith(
      { buffer: PDF_BYTES, originalName: 'tai-lieu.pdf', mimeType: 'application/pdf' },
      'documents',
    );
    expect(prisma.uploadedFile.create).toHaveBeenCalledWith({
      data: {
        publicId: 'documents/stored.pdf',
        url: '/api/files/documents/stored.pdf',
        name: 'tai-lieu.pdf',
        size: PDF_BYTES.length,
        mimeType: 'application/pdf',
        folder: 'documents',
        ownerId: 'u1',
      },
    });
    expect(stored.url).toBe('/api/files/documents/stored.pdf');
  });

  it('chặn file vượt dung lượng cấu hình', async () => {
    const originalLimit = process.env.MAX_UPLOAD_SIZE_MB;
    process.env.MAX_UPLOAD_SIZE_MB = '1';

    try {
      const { service } = setup();
      const tooBig = file({ buffer: Buffer.alloc(1024 * 1024 + 1) });

      await expect(service.upload(tooBig, 'documents', 'u1')).rejects.toBeInstanceOf(
        PayloadTooLargeException,
      );
    } finally {
      process.env.MAX_UPLOAD_SIZE_MB = originalLimit;
    }
  });
});
