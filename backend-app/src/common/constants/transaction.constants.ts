/**
 * Prisma mặc định chỉ chờ 2s để mở transaction và 5s để chạy xong. Prisma Dev local
 * chậm hơn khi trang tải nhiều truy vấn song song và có thể ném P2028
 * ("Unable to start a transaction in the given time"). Nới rộng cho các transaction
 * nhiều truy vấn: production cũng chỉ chờ thêm thay vì trả 500.
 */
export const TRANSACTION_OPTIONS = {
  maxWait: 10_000,
  timeout: 15_000,
} as const;
