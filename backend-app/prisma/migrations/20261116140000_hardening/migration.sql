-- Bỏ cache "chết" Subject.documentCount: danh sách môn dùng _count thật, cột này luôn 0.
ALTER TABLE "Subject" DROP COLUMN "documentCount";

-- Metadata file đã upload: nguồn sự thật cho name/size/mimeType và biết file nào đã dùng.
CREATE TABLE "UploadedFile" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "folder" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "documentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UploadedFile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UploadedFile_publicId_key" ON "UploadedFile"("publicId");
CREATE INDEX "UploadedFile_ownerId_createdAt_idx" ON "UploadedFile"("ownerId", "createdAt");
CREATE INDEX "UploadedFile_documentId_idx" ON "UploadedFile"("documentId");

ALTER TABLE "UploadedFile" ADD CONSTRAINT "UploadedFile_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UploadedFile" ADD CONSTRAINT "UploadedFile_documentId_fkey"
  FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;
