/**
 * Groups every environment variable in one place with dev defaults.
 * TODO(phase 1): wrap with @nestjs/config (ConfigModule.forRoot({ load: [configuration] }))
 * and validate with Joi/zod so a missing required variable fails fast.
 */
export interface AppConfiguration {
  port: number;
  /** Frontend origin, used to build the email verification link. */
  appUrl: string;
  corsOrigins: string[];
  jwt: {
    accessSecret: string;
    accessTtl: string;
    /** Same TTL as a number, because @nestjs/jwt types expiresIn as seconds. */
    accessTtlSeconds: number;
    refreshSecret: string;
    refreshTtl: string;
    refreshTtlSeconds: number;
  };
  mail: {
    /** console = print the verification link to the backend log (dev default). */
    driver: 'console' | 'smtp';
    from: string;
    smtp: {
      host: string;
      port: number;
      user: string;
      pass: string;
      /** true cho cổng 465 (SSL); 587 dùng STARTTLS nên để false. */
      secure: boolean;
    };
  };
  storage: {
    driver: 'local' | 'cloudinary' | 's3';
    uploadDir: string;
    maxUploadSizeMb: number;
  };
  /** Giới hạn request theo IP cho các route nhạy cảm (xem `RateLimitGuard`). */
  rateLimit: {
    /** true khi chạy sau reverse proxy để Express đọc X-Forwarded-For. */
    trustProxy: boolean;
    login: { limit: number; windowMs: number };
    forgotPassword: { limit: number; windowMs: number };
    documentCreate: { limit: number; windowMs: number };
  };
}

/** Parses "15m" / "7d" / "30s" / "12h" into seconds; falls back when malformed. */
function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/** Số phút → ms; sai/thiếu thì dùng mặc định. */
function minutesToMs(value: string | undefined, fallbackMinutes: number): number {
  const parsed = Number(value);
  const safeMinutes = Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackMinutes;

  return Math.round(safeMinutes * 60 * 1000);
}

function parseDuration(value: string | undefined, fallbackSeconds: number): number {
  const match = /^(\d+)\s*([smhd])$/.exec(value?.trim() ?? '');

  if (!match) {
    return fallbackSeconds;
  }

  const amount = Number(match[1]);
  const unit = match[2] as 's' | 'm' | 'h' | 'd';
  const secondsPerUnit = { s: 1, m: 60, h: 3600, d: 86400 }[unit];

  return amount * secondsPerUnit;
}

export default (): AppConfiguration => ({
  port: Number(process.env.PORT ?? 3000),
  appUrl: process.env.APP_URL ?? 'http://localhost:4200',
  corsOrigins: (process.env.CORS_ORIGIN ?? 'http://localhost:4200').split(','),
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret',
    accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
    accessTtlSeconds: parseDuration(process.env.JWT_ACCESS_TTL, 15 * 60),
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret',
    refreshTtl: process.env.JWT_REFRESH_TTL ?? '7d',
    refreshTtlSeconds: parseDuration(process.env.JWT_REFRESH_TTL, 7 * 24 * 60 * 60),
  },
  mail: {
    driver: (process.env.MAIL_DRIVER as AppConfiguration['mail']['driver']) ?? 'console',
    from: process.env.MAIL_FROM ?? 'Learning Hub <no-reply@learninghub.local>',
    smtp: {
      host: process.env.SMTP_HOST ?? '',
      port: Number(process.env.SMTP_PORT ?? 587),
      user: process.env.SMTP_USER ?? '',
      pass: process.env.SMTP_PASS ?? '',
      secure:
        process.env.SMTP_SECURE !== undefined
          ? process.env.SMTP_SECURE === 'true'
          : Number(process.env.SMTP_PORT ?? 587) === 465,
    },
  },
  storage: {
    driver: (process.env.STORAGE_DRIVER as AppConfiguration['storage']['driver']) ?? 'local',
    uploadDir: process.env.UPLOAD_DIR ?? './uploads',
    maxUploadSizeMb: Number(process.env.MAX_UPLOAD_SIZE_MB ?? 20),
  },
  rateLimit: {
    trustProxy: process.env.TRUST_PROXY === 'true',
    login: {
      limit: positiveInt(process.env.RATE_LIMIT_LOGIN_MAX, 10),
      windowMs: minutesToMs(process.env.RATE_LIMIT_LOGIN_WINDOW_MIN, 5),
    },
    forgotPassword: {
      limit: positiveInt(process.env.RATE_LIMIT_FORGOT_MAX, 5),
      windowMs: minutesToMs(process.env.RATE_LIMIT_FORGOT_WINDOW_MIN, 15),
    },
    documentCreate: {
      limit: positiveInt(process.env.RATE_LIMIT_DOCUMENT_MAX, 10),
      windowMs: minutesToMs(process.env.RATE_LIMIT_DOCUMENT_WINDOW_MIN, 60),
    },
  },
});
