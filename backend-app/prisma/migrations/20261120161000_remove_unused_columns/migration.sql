-- Dọn các cột không còn dùng:
--   User.studentCode      — mã sinh viên không dùng ở đăng ký/hồ sơ/tìm kiếm
--   Subject.description   — môn học chỉ có mã + tên
--   Subject.deletedAt     — môn học đã xoá cứng
--   Document.content      — không có UI nào gửi markdown bài viết
--   Document.deletedAt    — tài liệu đã xoá cứng
--   Notification.link     — thông báo không mở link chi tiết nữa
--
-- Trước khi bỏ hai cột deletedAt phải xoá hẳn các row đang xoá mềm: nếu chỉ drop cột,
-- chúng sẽ xuất hiện trở lại trong danh sách (kể cả tài liệu của môn đã xoá mềm).
-- Hai câu DELETE phải ở cùng migration với các DROP COLUMN bên dưới — tách sang
-- migration sau thì không còn cột deletedAt để biết row nào đã bị xoá mềm.
-- DocumentFile, DocumentView và Rating có FK ON DELETE CASCADE nên bị dọn theo tài liệu.
-- UploadedFile.documentId là ON DELETE SET NULL: row UploadedFile của tài liệu bị xoá được
-- giữ lại với documentId = NULL (thành file chưa gắn tài liệu, chủ sở hữu có thể dùng lại)
-- để không mất publicId — migration SQL không xoá được object trên storage.
DELETE FROM "Document"
WHERE "deletedAt" IS NOT NULL
   OR "subjectId" IN (SELECT "id" FROM "Subject" WHERE "deletedAt" IS NOT NULL);

-- Document.subjectId không có ON DELETE CASCADE, nên chỉ xoá môn sau khi tài liệu
-- thuộc môn đó (kể cả tài liệu đang hoạt động) đã bị xoá ở câu trên. Việc môn xoá mềm
-- kéo theo tài liệu đang hoạt động là chủ ý: bỏ deletedAt của Subject sẽ làm cả hai
-- hiện lại trong danh sách.
DELETE FROM "Subject"
WHERE "deletedAt" IS NOT NULL;

ALTER TABLE "User" DROP COLUMN "studentCode";
ALTER TABLE "Subject" DROP COLUMN "description";
ALTER TABLE "Subject" DROP COLUMN "deletedAt";
ALTER TABLE "Document" DROP COLUMN "content";
ALTER TABLE "Document" DROP COLUMN "deletedAt";
ALTER TABLE "Notification" DROP COLUMN "link";
