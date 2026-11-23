# HANDOFF — Learning Hub (Angular + NestJS)

Written 2026-11-23 from the actual repository at commit `4f29cc6` (`refactor(prune): map retention env vars in one tested place`), working tree clean.
Everything below was read from the repo unless marked **UNVERIFIED** (not re-run/confirmed in this handoff session).

---

## 1. PROJECT OVERVIEW

**What it is:** “Learning Hub” — a document-sharing web app for Vietnamese university students. Students upload lecture notes / exam material per subject, an admin reviews every document before it becomes public, files are served through authenticated endpoints (not public links). UI copy is Vietnamese; the landing page is the brand authority.

**Primary users**
- **Student (`Role.USER`)** — finds approved documents by subject / file type / keyword, uploads 1–3 files, follows `PENDING`/`APPROVED` state, reads PDF/DOCX in-app, rates documents, earns EXP/level, sees a leaderboard, gets notifications.
- **Admin (`Role.ADMIN`)** — separate operations console: approve/reject/delete documents, manage subjects, browse/warn users (3 warnings → `BANNED`), broadcast/revoke announcements, toggle document uploads on/off. Admins deliberately **cannot** use the student UI (`studentGuard` redirects them to `/admin/dashboard`).

**Current scope / product truths**
- Every document is reviewed before it is public; `PENDING` documents are visible only to their author and admins.
- One subject per document (no join table).
- Desktop/laptop only: designed at 1440px, verified 1280–1920px. New mobile breakpoints are explicitly out of scope (existing landing mobile CSS is left untouched).
- Remaining known product gap: cloud file storage driver (`cloudinary`/`s3`) is not implemented; only `local` disk storage exists.

---

## 2. TECH STACK & VERSIONS

### Frontend (`frontend-app`)
| Item | Value |
|---|---|
| Framework | Angular `^21.1.0` (CLI/build `^21.1.1`) |
| Architecture | **Standalone components only** (`loadComponent` lazy routes), no NgModules |
| State | **Angular signals** in root services (`AuthService`, `NotificationStateService`, `ToastService`); no NgRx, no other state lib |
| UI | Tailwind CSS v4 (`@tailwindcss/postcss` `^4.1.12`, `@import "tailwindcss"` in `src/styles.css`) + hand-written component classes in `src/styles.css`. No Angular Material / PrimeNG / etc. |
| Fonts | Be Vietnam Pro, self-hosted under `public/fonts` (weights 400/500/600, latin + vietnamese subsets) |
| Routing | `@angular/router` with `provideRouter(routes, withComponentInputBinding())`, per-route `title` |
| HTTP | `provideHttpClient(withFetch(), withInterceptors([authInterceptor, errorInterceptor]))` |
| i18n | None (no `@angular/localize`); Vietnamese strings inline |
| Viewer | `docx-preview` `^0.4.1` for DOCX; PDF preview also in the reader page |
| Tests | Vitest `^4.0.8` through `@angular/build:unit-test`, `jsdom` `^27.1.0`, `tsconfig.spec.json` includes `vitest/globals` |
| TypeScript | `~5.9.2` |

### Backend (`backend-app`)
| Item | Value |
|---|---|
| Framework | NestJS `^12.x` on Express 5 (`@nestjs/platform-express`) |
| ORM / DB | Prisma `7.10.1` + PostgreSQL; **Prisma 7 driver adapter** `@prisma/adapter-pg` + `pg` |
| Generated client | `prisma-client` generator with `output = "../src/generated/prisma"` (committed in source tree) |
| Auth | `@nestjs/jwt` `^12.0.3`; access token (memory, 15m default) + refresh token in HttpOnly cookie `lh_refresh` (7d default); refresh token stored as sha256 hash in `User.refreshTokenHash` |
| Passwords | `bcryptjs` `^3.x`, 10 rounds |
| Validation | `class-validator` + `class-transformer`; global `ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false })` |
| Config | Plain env loading: `src/config/load-env.ts` + `src/config/configuration.ts` (no `@nestjs/config` yet — explicit `TODO(phase 1)` in `configuration.ts`) |
| Security | `helmet` (CSP off because nginx serves HTML, `crossOriginResourcePolicy: cross-origin`), custom rate limiting (`RateLimitGuard`, in-memory or `ioredis` when `REDIS_URL` is set) |
| Mail | `MailService` with `console` (default) and `smtp` (`nodemailer`) drivers |
| Files | `StorageService` + `local` driver writing to `UPLOAD_DIR`, served by `FilesController` at `/api/files/...` |
| Tests | Jest `^30` with ts-jest **ESM** (`NODE_OPTIONS=--experimental-vm-modules`); `supertest` for e2e |
| Lint / format | `oxlint` `^1.58.0`, `prettier` |
| TypeScript | `^6.0.2` |

### Runtime / infra
- **CI Node version: 22** (`.github/workflows/ci.yml`, `actions/setup-node@v4`).
- In this cloud workspace `node -v` was **v26.13.1**, `npm 11.20.0` (**UNVERIFIED** that everything is officially supported on 26; CI is the reference).
- Package manager: **npm** with committed `package-lock.json` in each app. Frontend declares `"packageManager": "npm@11.6.2"`.
- `docker-compose.yml` at repo root: `db` (postgres:16-alpine, internal only), `migrate` (runs `prisma migrate deploy`), `backend` (port 3000), `frontend` (nginx, port 8080; proxies `/api` to backend).
- No TypeScript project references / monorepo tooling: `frontend-app` and `backend-app` are two independent npm projects.

---

## 3. PROJECT STRUCTURE

```
/
├── README.md                # product + run instructions (Vietnamese)
├── PRODUCT.md               # product truths, users, jobs, assumptions
├── DESIGN.md                # design system: palette, type, surfaces, component classes
├── docker-compose.yml
├── .github/workflows/ci.yml
├── artifacts/               # UI screenshots from earlier rounds (PNG, not shipped)
├── backend-app/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── seed.ts                       # admin + 5 subjects + avatar frames (idempotent)
│   │   └── migrations/                   # 7 migrations, see §5
│   ├── scripts/prune-data.ts             # `npm run db:prune` (cron job)
│   ├── src/
│   │   ├── main.ts                       # bootstrap: helmet, prefix /api, CORS, pipes, filters, interceptors
│   │   ├── app.module.ts, app.controller.ts (`GET /api/health`), app.service.ts
│   │   ├── config/                       # load-env.ts, configuration.ts, retention.ts (+ retention.spec.ts)
│   │   ├── common/
│   │   │   ├── constants/upload.constants.ts   # folders, MIME map, magic-byte / OOXML checks
│   │   │   ├── decorators/               # current-user, rate-limit, roles
│   │   │   ├── dto/pagination-query.dto.ts
│   │   │   ├── enums/                    # role, document-status
│   │   │   ├── filters/http-exception.filter.ts
│   │   │   ├── guards/                   # jwt-auth, roles, rate-limit, rate-limit.store
│   │   │   ├── interceptors/response.interceptor.ts
│   │   │   ├── interfaces/authenticated-user.interface.ts
│   │   │   ├── utils/                    # day-key (Asia/Ho_Chi_Minh), refresh-cookie, retention
│   │   │   └── validators/password.constraints.ts
│   │   ├── generated/prisma/             # committed Prisma 7 client
│   │   ├── infra/
│   │   │   ├── mail/                     # mail.module.ts, mail.service.ts, README
│   │   │   ├── prisma/                   # prisma.module.ts (@Global), prisma.service.ts (driver adapter)
│   │   │   └── storage/                  # storage.module.ts, storage.service.ts, storage.types.ts, drivers/local.driver.ts
│   │   └── modules/
│   │       ├── auth/ users/ subjects/ documents/ uploads/ files/
│   │       ├── dashboard/ notifications/ ratings/ gamification/ settings/
│   │       ├── admin/                    # dashboard/documents/notifications/subjects/users controllers + admin.service.ts
│   │       ├── maintenance/prune-retention.ts
│   │       └── uploads/orphan-uploads.ts
│   └── test/                             # 17 *.e2e-spec.ts + create-test-app.ts, e2e-env.ts, jest-e2e.json
└── frontend-app/
    ├── angular.json, proxy.conf.json, nginx.conf, Dockerfile
    ├── public/fonts/…
    └── src/
        ├── main.ts, index.html, styles.css     # global font faces + Tailwind + shared component classes
        └── app/
            ├── app.ts / app.html / app.css / app.config.ts / app.routes.ts / app.spec.ts
            ├── core/
            │   ├── constants/api.constants.ts   # API_BASE_URL='/api', AUTH_USER_KEY='lh_user'
            │   ├── guards/       # auth, admin, student, guest, unsaved-changes
            │   ├── interceptors/ # auth.interceptor.ts, error.interceptor.ts
            │   ├── models/       # api, user, document, subject, notification, rating, upload, dashboard, admin, gamification, system-settings, avatar-frame, index.ts
            │   ├── services/     # auth, user, subject, document, upload, rating, notification, notification-state, dashboard, admin, gamification, avatar-frame, toast
            │   ├── utils/        # api-error, document-status, format, http-params
            │   └── validators/password.validator.ts
            ├── features/
            │   ├── marketing/landing/
            │   ├── auth/{login,register,verify-email,forgot-password,reset-password}/
            │   ├── dashboard/dashboard/
            │   ├── documents/{document-list,document-detail,document-upload,my-documents,document-viewer}/
            │   ├── leaderboard/leaderboard/
            │   ├── notifications/notification-list/
            │   ├── profile/{profile,change-password}/
            │   ├── ratings/rating-section/
            │   └── admin/{admin-dashboard,admin-documents? (admin-document-approval),admin-subjects,admin-users,admin-broadcast,admin-settings}/
            ├── layouts/{auth-layout,user-layout,admin-layout}/
            └── shared/components/README.md     # (only a README; no shared components yet)
```

### Naming & patterns
- Backend: feature module folder per domain, files `<name>.controller.ts`, `<name>.service.ts`, `<name>.module.ts`, DTOs in `dto/<verb>-<noun>.dto.ts`; unit tests `<file>.spec.ts` next to source; e2e in `test/<feature>.e2e-spec.ts`.
- Backend layers: **controller (HTTP + guards) → service (Prisma + business rules) → PrismaService**. No repository layer, no facades.
- Cross-cutting: `JwtAuthGuard` per controller/route, `RolesGuard` + `@Roles(Role.ADMIN)` for admin; `@CurrentUser()` decorator; `@RateLimit({limit, windowMs, message})`; errors thrown as Nest `HttpException`s, normalized globally.
- Frontend: `core/` = singleton services/models/guards/interceptors; `features/<area>/<page>/` = one foldable-free standalone component trio (`*.ts`, `*.html`, `*.css`); `layouts/` = shells. Services are `@Injectable({providedIn:'root'})`, use `HttpClient` + `map(res => res.data)`, hold state in `signal()`.
- Each backend module with non-obvious rules has a `README.md` in its folder (`gamification`, `notifications`, `ratings`, `settings`, `infra/mail`, `infra/prisma`, `infra/storage`) — **read those**; some are partially stale (see §7).

---

## 4. HOW TO RUN

### Backend
```bash
cd backend-app
npm ci                              # postinstall runs `prisma generate`
cp .env.example .env                # then set DATABASE_URL (+ JWT secrets)
npx prisma migrate deploy           # or npm run db:migrate (dev, creates migration)
npm run db:seed                     # dev admin + 5 subjects + avatar frames
npm run start:dev                   # http://localhost:3000/api  (GET /api/health)
```
Other scripts: `npm run build` (`nest build`), `npm run start:prod` (`node dist/main`), `npm run lint` (`oxlint src/ test/`), `npm run format` (prettier), `npm run db:studio`, `npm run db:prune` (`tsx scripts/prune-data.ts`).
Typecheck: `npx tsc --noEmit -p tsconfig.json` (CI uses `tsconfig.json`; `tsconfig.build.json` also works).

### Frontend
```bash
cd frontend-app
npm ci
npm start            # ng serve → http://localhost:4200 (proxies /api → http://127.0.0.1:3000)
npm run build        # production build
npm test             # ng test (Vitest via @angular/build:unit-test)
```
There is **no** frontend lint script.

### Database — local options
1. Prisma Dev (used in recent sessions, ephemeral Postgres):
   ```bash
   npx prisma dev --detach --name learning-hub-e2e   # prints the connection URL
   npx prisma migrate deploy
   npx prisma dev stop learning-hub-e2e
   npx prisma dev ls                                 # expect: not_running
   ```
   In the last session the printed URL was
   `postgresql://postgres:postgres@localhost:51214/learning_hub_e2e?sslmode=disable` — **the port is allocated per run, read it from the output**.
2. Docker: `docker compose up --build` (Postgres + migrate + backend + nginx frontend on :8080).

### Environment variables (names + meaning only — never commit real values)
`backend-app/.env` is git-ignored. From `.env.example`:
- `PORT` (default 3000), `CORS_ORIGIN` (comma-separated list, credentials enabled), `APP_URL` (frontend origin used to build the email verification/reset link).
- `DATABASE_URL`.
- `JWT_ACCESS_SECRET`, `JWT_ACCESS_TTL` (default `15m`), `JWT_REFRESH_SECRET`, `JWT_REFRESH_TTL` (default `7d`). In production both secrets must be set, ≥32 chars and different (`assertSecureSecrets()` fails fast in `main.ts`).
- `MAIL_DRIVER=console|smtp`, `MAIL_FROM`, `SMTP_HOST/PORT/SECURE/USER/PASS`. `MAIL_DRIVER=smtp` without `SMTP_HOST` fails at bootstrap.
- Rate limits: `RATE_LIMIT_LOGIN_MAX/WINDOW_MIN`, `RATE_LIMIT_REGISTER_MAX/WINDOW_MIN`, `RATE_LIMIT_RESEND_MAX/WINDOW_MIN`, `RATE_LIMIT_FORGOT_MAX/WINDOW_MIN`, `RATE_LIMIT_DOCUMENT_MAX/WINDOW_MIN`, `TRUST_PROXY` (`true` behind a reverse proxy so Express reads `X-Forwarded-For`).
- Storage: `STORAGE_DRIVER=local` (only implemented; `cloudinary`/`s3` throw at bootstrap), `UPLOAD_DIR` (default `./uploads`), `MAX_UPLOAD_SIZE_MB` (default 20).
- Optional `REDIS_URL` — when set, rate-limit counters live in Redis instead of process RAM.
- Retention (default 180 for all four): `DOCUMENT_VIEW_RETENTION_DAYS`, `NOTIFICATION_READ_RETENTION_DAYS`, `PERSONAL_NOTIFICATION_RETENTION_DAYS`, `EXP_LOG_RETENTION_DAYS`; plus `UPLOAD_ORPHAN_RETENTION_DAYS` (default 7, read in the script only).
- Seed-only: `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` (documented dev defaults exist in README/seed; do not reuse in production).
- Commented-out placeholders: `CLOUDINARY_*`.

### FE → BE
- Frontend uses **relative** `/api` (`core/constants/api.constants.ts`), dev server proxies `/api` to `http://127.0.0.1:3000` via `proxy.conf.json`; in Docker nginx does the same. No absolute API URL / no environment files.
- CORS is enabled with `credentials: true` for `CORS_ORIGIN` origins (needed for the refresh cookie); cookie refresh flow also works through the proxy because the browser sees one origin.
- API envelope: success `{ success: true, data, timestamp }`, error `{ success: false, statusCode, message, code?, path, timestamp }` (`ResponseInterceptor`, `HttpExceptionFilter`).

---

## 5. CURRENT STATE

**Nothing is in progress: working tree is clean at `4f29cc6`.** There is no uncommitted work, no half-finished file, no failing known test at handoff time.

### 5.1 Recently completed work (last 6 commits)
```
4f29cc6 refactor(prune): map retention env vars in one tested place
c090bd2 test(prune): cover every retention section against real Postgres
079a095 refactor(prune): extract retention sections and env parser from the script
0ba42ad test(uploads): cover orphan cleanup end to end against real disk
bab87cc test(dashboard): pin every overview stat against a decoy account
4943425 refactor(uploads): extract orphan cleanup and share retention cutoff
```
What that produced (all committed):
- `src/common/utils/retention.util.ts` — `cutoffBefore(days, now = new Date())`, private `DAY_MS`, single source for “older than N days”.
- `src/config/retention.ts` — `RetentionWindows` (`documentViewDays`, `notificationReadDays`, `personalNotificationDays`, `expLogDays`), `retentionDays(value, fallback)` (accepts only finite `> 0`, otherwise fallback; `Number('') === 0` falls back), `retentionWindowsFromEnv(env = process.env)` mapping each env var exactly once, default 180.
- `src/config/retention.spec.ts` — 9 tests (6 bad-value fallbacks: `undefined`, `''`, `'0'`, `'-7'`, `'abc'`, `'Infinity'`; 1 valid; 2 `retentionWindowsFromEnv` value-mapping tests).
- `src/modules/maintenance/prune-retention.ts` — `pruneRetentionData(prisma, windows)` with `PruneRetentionOptions extends RetentionWindows { now?: Date }` and `PruneRetentionResult`; deletes `DocumentView` older than cutoff, stale **broadcasts** (`userId: null`) together with their `NotificationRead` rows (counts reads before delete), `ExpLog` older than cutoff, and **personal notifications only when already read** (`userId: { not: null }, readAt: { lt: cutoff }`).
- `src/modules/uploads/orphan-uploads.ts` — `removeOrphanUploads(prisma, storage, { retentionDays, now?, log? })`: excludes avatar URLs currently in use (`User.avatarUrl`), selects `UploadedFile` with `documentId: null` older than cutoff, deletes **row first** per `publicId` (guarded by `documentId: null`, catches P2025 case), then `storage.removeMany(removed)`.
- `scripts/prune-data.ts` — reads env only (`retentionWindowsFromEnv()`, `retentionDays(process.env.UPLOAD_ORPHAN_RETENTION_DAYS, 7)`), calls both functions, prints 5 log lines, `main().catch(...)` (no top-level await; tsx limitation).
- `test/prune-retention.e2e-spec.ts` — 1 `it` with many id-pinned assertions, real Postgres, fixed `now` (seeded rows at `−1ms` past cutoff, exactly at cutoff, and inside window; broadcast old/new; personal unread old vs read old/new; 3 `NotificationRead`; 2 `ExpLog`), plus a pre-prune guard `notificationRead.count(staleBroadcastId) === 2`.
- `test/orphan-cleanup.e2e-spec.ts` — 2 tests: old orphan removed, in-use avatar / new file / document-attached file kept; orphan row whose disk file is already gone deletes without throwing.

### 5.2 Modules already complete
| Module | State | Key files |
|---|---|---|
| `auth` | ✅ register → email verification → login/refresh/logout → change password → forgot/reset password (1h, single-use token; password change revokes other sessions) | `modules/auth/*`, `common/utils/refresh-cookie.util.ts`, `config/configuration.ts` |
| `users` | ✅ me/profile update, avatar upload, avatar-frame selection, public profile | `modules/users/*`, `avatar-frame.constants.ts` |
| `subjects` | ✅ public list/detail; admin create/delete (delete refused while documents exist, per backend README) | `modules/subjects/*`, `modules/admin/admin-subjects.controller.ts` |
| `documents` | ✅ list/search/filter/sort/paginate (approved only), `mine`, detail + per-user-per-day view counting, create (`PENDING`, 1–3 files, rate-limited, respects uploads toggle), delete own, admin approve/reject(=hard delete + notify)/delete | `modules/documents/*`, `modules/admin/admin-documents.controller.ts`, `modules/documents/documents.service.ts` |
| `uploads` + `files` | ✅ authenticated multipart upload with extension↔MIME↔magic-byte/OOXML checks; files served by `FilesController` with per-document authorization; avatars public | `modules/uploads/*`, `modules/files/files.controller.ts`, `common/constants/upload.constants.ts` |
| `gamification` | ✅ EXP rules `VIEW +1`, `RATING +5`, `DOCUMENT_APPROVED +20`, `ExpLog` per event, `levelStep(level)=round(100*level^1.5)`, `levelFromExp`, leaderboard `GET /api/leaderboard` | `modules/gamification/*` |
| `ratings` | ✅ upsert per user/document, 1–5 stars + comment ≤1000, only approved docs, author cannot rate own, recomputes cached `Document.ratingAvg/ratingCount` in the same transaction | `modules/ratings/*` |
| `notifications` | ✅ personal + broadcast, per-user read state (`NotificationRead`), mark read / read-all / delete own personal only, admin broadcast + revoke | `modules/notifications/*`, `modules/admin/admin-notifications.controller.ts` |
| `dashboard` | ✅ `GET /api/dashboard/overview` — stats, 7-day view trend, recent 5, top 5 | `modules/dashboard/*` |
| `admin` | ✅ overview stats/recent activity, document queue, users list/detail + warnings (3rd warning bans), subjects, broadcasts, settings | `modules/admin/*` |
| `settings` | ✅ `SystemSetting` key/value; `document.uploadsEnabled` read on every document create; default = enabled |
| `infra/storage` | 🟡 `local` driver only; cloud drivers missing and fail fast | `infra/storage/*` |
| `infra/mail` | ✅ `console` + `smtp` | `infra/mail/*` |
| `maintenance` | ✅ retention prune + orphan upload cleanup (`npm run db:prune`) | `modules/maintenance/*`, `modules/uploads/orphan-uploads.ts`, `scripts/prune-data.ts` |
| `frontend` | ✅ all pages listed in §5.4, redesign applied, admin console admin-only, desktop-only convention | `frontend-app/src/app/**` |

### 5.3 API endpoints (all prefixed `/api`, all return the envelope above)
**Public**
- `GET /api/health` → `{ status, service, uptime, timestamp }`.
- `GET /api/subjects`, `GET /api/subjects/:id`.
- `POST /api/auth/register` `{email,password,fullName}` → message (creates unverified account, sends link).
- `POST /api/auth/verify-email` `{token}`; `POST /api/auth/resend-verification` `{email}` (throttled).
- `POST /api/auth/forgot-password` `{email}` (neutral response); `POST /api/auth/reset-password` `{token,newPassword}`.
- `POST /api/auth/login` `{email,password}` → `{accessToken,user}` + `lh_refresh` cookie; 403 `EMAIL_NOT_VERIFIED` when unverified; rate-limited.
- `POST /api/auth/refresh` (cookie or `{refreshToken}`) → new `{accessToken,user}` + rotated cookie.
- `POST /api/auth/logout` → revokes session, clears cookie.
- `GET /api/files/:folder/:name` — `avatars/*` public; `documents/*` requires `Authorization: Bearer`; `PENDING` only author/admin.

**Authenticated (`JwtAuthGuard`)**
- `PATCH /api/auth/password` `{currentPassword,newPassword}` → `{message, accessToken, user}`.
- `GET /api/users/me`, `PATCH /api/users/me`, `PATCH /api/users/me/avatar`, `PATCH /api/users/me/avatar-frame`, `GET /api/users/:id`.
- `GET /api/avatar-frames`.
- `GET /api/documents?page&limit&sort=field:asc|desc&keyword&subjectIds[]&authorIds[]&fileTypes[]&minRating` (approved only) → `{items, meta}`.
- `GET /api/documents/mine?…` (all statuses, own).
- `GET /api/documents/:id` → detail + `viewCountedToday`.
- `POST /api/documents` `{title(5–200), description?≤1000, subjectId(uuid), files:[{publicId}] (1–3)}` → `PENDING` (rate-limited; 403 when uploads disabled).
- `DELETE /api/documents/:id` (own document; hard delete, cascades ratings/files history rows).
- `POST /api/uploads` multipart `file` + `folder=documents|avatars` → `{url, publicId, name, size, mimeType}`. PDF/DOCX/PPTX for documents, PNG/JPG/WEBP for avatars, ≤ `MAX_UPLOAD_SIZE_MB`.
- `GET /api/documents/:documentId/ratings?page&limit`, `POST /api/documents/:documentId/ratings` `{stars 1..5, comment?}` (upsert).
- `GET /api/dashboard/overview`.
- `GET /api/leaderboard?limit=1..50`.
- `GET /api/notifications?page&limit&unreadOnly`, `PATCH /api/notifications/read-all`, `PATCH /api/notifications/:id/read`, `DELETE /api/notifications/:id` (403 for broadcasts).

**Admin (`JwtAuthGuard` + `RolesGuard` + `@Roles(Role.ADMIN)`)**
- `GET /api/admin/dashboard/overview`.
- `GET /api/admin/documents?status=PENDING&…`, `PATCH /api/admin/documents/:id/approve`, `PATCH /api/admin/documents/:id/reject` `{reason}`, `DELETE /api/admin/documents/:id`.
- `GET /api/admin/subjects`, `POST /api/admin/subjects`, `DELETE /api/admin/subjects/:id`.
- `GET /api/admin/users?keyword&role&status&warnedOnly&page&limit`, `GET /api/admin/users/:id`, `POST /api/admin/users/:id/warnings` `{reason}`.
- `POST /api/admin/notifications/broadcast` `{title(5–120), message(10–1000)}`, `GET /api/admin/notifications`, `DELETE /api/admin/notifications/:id`.
- `GET /api/admin/settings` → `{uploadsEnabled, updatedAt}`, `PATCH /api/admin/settings` `{uploadsEnabled: boolean}`.

### 5.4 Frontend routes → screens
| Route | Layout / guard | Feature file |
|---|---|---|
| `/` | public | `features/marketing/landing` |
| `/auth/login`, `/auth/register`, `/auth/verify-email`, `/auth/forgot-password`, `/auth/reset-password` | `AuthLayout` + `guestGuard` | `features/auth/*` |
| `/dashboard` | `UserLayout` + `authGuard` + `studentGuard` | `features/dashboard/dashboard` |
| `/documents`, `/documents/:id`, `/viewer`, `/upload`, `/my-documents` | same | `features/documents/*` |
| `/leaderboard`, `/notifications`, `/profile`, `/profile/password` | same (`/profile` also `unsavedChangesGuard`) | `features/*` |
| `/admin/dashboard`, `/admin/subjects`, `/admin/documents`, `/admin/viewer`, `/admin/users`, `/admin/broadcast`, `/admin/settings` | `AdminLayout` + `authGuard` + `adminGuard` | `features/admin/*`, `features/documents/document-viewer` |
| `**` | redirect → `/documents` | — |

Key frontend mechanics: access token only in memory (`AuthService`), user profile cached in `localStorage` key `lh_user` (not a secret), `provideAppInitializer(bootstrapSession())` refreshes the session after F5, `errorInterceptor` retries once on 401 (shared in-flight refresh, `x-retried-after-refresh` guard header) and shows toasts for status 0 / ≥500 except `/api/uploads` (that page shows inline errors).

### 5.5 Database schema (Prisma, PostgreSQL) — `backend-app/prisma/schema.prisma`
Enums: `Role {USER, ADMIN}`, `UserStatus {ACTIVE, WARNED, BANNED}`, `DocumentStatus {PENDING, APPROVED}`, `NotificationType {DOCUMENT_APPROVED, DOCUMENT_REJECTED, DOCUMENT_DELETED, SYSTEM, ACCOUNT_WARNING}`, `ExpReason {VIEW, RATING, DOCUMENT_APPROVED, ADMIN_ADJUST}`.

Models & relationships:
- `User` — email unique, passwordHash, fullName, bio?, avatarUrl?, avatarFrameId?, role, status, warningCount, level, exp, `emailVerifiedAt?` (null ⇒ cannot log in), `refreshTokenHash?`, `deletedAt?`. Relations: `avatarFrame`, `documents`, `ratings`, `warnings` (as target) / `givenWarnings` (as admin), `notifications`, `notificationReads`, `expLogs`, `uploadedFiles`, `emailVerificationTokens`, `passwordResetTokens`. Indexes `[role,status]`, `[level,exp]`.
- `EmailVerificationToken` / `PasswordResetToken` — only sha256 `tokenHash` (unique), `expiresAt`, `usedAt?`, cascade on user delete.
- `Subject` — `code` unique, `name`; has many `Document`.
- `Document` — title, description?, status (default PENDING), viewCount, cached ratingAvg/ratingCount, publishedAt?, subjectId, authorId, no `deletedAt` (**hard delete**). Cascades: `DocumentFile`, `DocumentView`, `Rating`; `UploadedFile.documentId` is `SetNull`. Indexes `[status,publishedAt]`, `[subjectId,status]`, `[authorId]`, `[viewCount]`.
- `DocumentFile` — url, publicId?, name, size, mimeType, cascade with document.
- `UploadedFile` — `publicId` unique source of truth for upload metadata, folder, ownerId, `documentId?` (null = unattached → orphan-cleanup candidate). Indexes `[ownerId,createdAt]`, `[documentId]`.
- `DocumentView` — unique `[documentId, viewerKey, dayKey]`; `viewerKey` always userId, `dayKey` = `YYYY-MM-DD` in Asia/Ho_Chi_Minh; cascade with document.
- `Rating` — unique `[documentId,userId]`, stars 1–5, comment?.
- `UserWarning` — reason, userId, adminId (+ index `[userId,createdAt]`).
- `Notification` — type, title, message, `userId?` (null = broadcast), `readAt?` (personal only), cascade-deleted reads.
- `NotificationRead` — composite id `[userId, notificationId]`, `readAt`, `deletedAt?` (per-user hide), cascade both sides.
- `ExpLog` — delta, reason, refId?, index `[userId,createdAt]` (**no cascade** from User).
- `AvatarFrame` — name, assetUrl, minLevel; `SystemSetting` — `key` @id, `value` Json, updatedAt.

Migrations (in order): `20261105172926_init`, `20261108043759_add_password_reset_token`, `20261116140000_hardening`, `20261116160000_notification_reads`, `20261118180000_remove_document_rejected_status`, `20261120160000_notification_read_hidden`, `20261120161000_remove_unused_columns`.

### 5.6 Test inventory & last known results
- Backend unit: 7 suites / **37 tests** (`app.controller.spec.ts`, `config/retention.spec.ts`, `infra/storage/drivers/local.driver.spec.ts`, `infra/storage/storage.service.spec.ts`, `modules/auth/auth.service.password-reset.spec.ts`, `modules/uploads/orphan-uploads.spec.ts`, `modules/uploads/uploads.service.spec.ts`). Last verified **pass** after `4f29cc6`.
- Backend e2e: 17 suites / **67 `it`** (`account`, `admin-console`, `app`, `auth-flow`, `avatar-frames`, `dashboard-overview`, `documents`, `files`, `gamification`, `notifications`, `orphan-cleanup`, `password-reset`, `prune-retention`, `rate-limit`, `ratings`, `regressions`, `settings`). Last **full green run was against `c090bd2`**; `4f29cc6` only touched config/script/tests, **not re-run in this handoff session** (**UNVERIFIED after `4f29cc6`**).
- Frontend: 5 spec files (`app.spec.ts`, `document-viewer.spec.ts`, `route-access.guard.spec.ts`, `route-access.routing.spec.ts`, `error.interceptor.spec.ts`); current pass/fail **UNVERIFIED** (not run here). CI does **not** run them.

---

## 6. KEY DECISIONS & CONVENTIONS

**Architecture / security**
1. **Refresh token in HttpOnly cookie, access token in memory only.** Nothing sensitive in `localStorage` (only the user profile under `lh_user`). Reason: XSS cannot read tokens; F5 works via `bootstrapSession()`.
2. **All document endpoints require login** — even listing. Guests only see the landing page. File access is authorized per document (`FilesController`), replacing the old static upload mount that leaked `PENDING` files.
3. **Hard delete for documents.** A rejected document is deleted (with a notification explaining the reason) rather than kept as `REJECTED`; the `REJECTED` status and its data were removed by migration. There is no `Document.deletedAt`.
4. **Admin and student surfaces are strictly separate** (`studentGuard` / `adminGuard`). Deliberate: the admin console is an operations tool, not a student view with extra buttons.
5. **Upload metadata is server-owned.** `POST /api/documents` accepts only `publicId`s; url/name/size/mime come from `UploadedFile`. Upload validation checks extension ↔ declared MIME ↔ real magic bytes (ZIP central-directory entry check for DOCX/PPTX, no unzip → no zip-bomb risk).
6. **`UploadedFile` is the source of truth for orphan cleanup** and avatars are excluded by URL from `User.avatarUrl` — otherwise the cleanup would delete avatars (they also have `documentId = null`).
7. **Prune semantics:** delete views/logs older than cutoff; delete **broadcasts** together with their read rows (deleting only read rows would resurrect “unread” badges for half-year-old announcements); keep **unread** personal notifications; `ExpLog` is only an audit trail (`User.exp/level` is authoritative).
8. **Config defaults must be safe:** bad/absent retention env ⇒ fallback 180, never “delete everything”; settings key missing ⇒ uploads enabled; production with weak/default JWT secrets refuses to boot.
9. **Rate limiting is custom + optional Redis** so a single instance needs no extra infra, and multiple instances share counters when `REDIS_URL` is set.
10. **Prisma 7 requires a driver adapter** (`PrismaPg`); the generated client lives in `src/generated/prisma` because `output` is mandatory. Scripts instantiate `new PrismaService()` directly; `tsx` is used for seeding because the generated client imports `.js` paths.

**Testing conventions (the user cares a lot about test strength)**
11. E2E = API/DB-level against a **real Postgres**; no browser E2E, no mocked Prisma in e2e. Frontend = Vitest + jsdom component/guard/interceptor tests.
12. **Tests must be able to fail.** After writing tests the previous agent mutated the implementation (backup file, apply mutation, run test, confirm red, restore) and reported mutation counts. Documented **equivalent mutants** that logically cannot be caught (do not chase them):
    - removing `documentId: null` from the orphan delete guard (the P2025 throw already protects it),
    - removing `force: true` in the local driver (removeMany swallows errors),
    - removing the try/catch inside `removeMany` (the driver never throws with `force`).
13. E2E **shares one database** (CI service Postgres). Every suite uses `suffix = Date.now()` in emails/codes/publicIds and cleans up in `afterAll`; whole-table counts are asserted with `>=`, while the load-bearing assertions are **by id**.
14. Tests take a `now`/`cutoff` parameter (`retentionDays`, `cutoffBefore`, `pruneRetentionData({now})`, `removeOrphanUploads({now})`) so time can be pinned.
15. “Fresh-eyes” review after each test-writing round: drop redundant cases/setup, check that each assertion can actually fail.

**UI conventions**
16. Palette/type/system live in `DESIGN.md` (ink `#0E2A32`, tide `#26636C`, marine `#8FC4C8`, mist `#C8DCDE`, foam `#EAF4F4`, canvas `#F4F9F9`, Be Vietnam Pro; panels 16px radius, 1px line border, no shadows; pills for buttons; inline SVG icons, no emoji).
17. Reuse the classes already in `src/styles.css` (`.panel`, `.panel-head`, `.metric-strip`, `.status-pill`, `.data-row`, `.field-input`, `.btn-primary`, `.empty-state`, `.file-mark`, `.alert-*`) before writing new ones; don’t add a second card style/radius/accent without updating `DESIGN.md`.
18. **Desktop/laptop only** (1280–1920px, design at 1440px). Do not add mobile breakpoints; leave existing landing responsive CSS untouched.

**Deliberately not done / tried and dropped**
- Cloudinary/S3 driver (waiting on a service account) — `STORAGE_DRIVER` other than `local` fails fast on purpose.
- A separate `Document`↔`Subject` join table (one subject per document, decided).
- Admin access to the student UI (explicitly blocked).
- `@nestjs/config` (planned, not done).
- A React/Vue rewrite, an ORM switch, or a realtime layer — nothing in the repo suggests these; do not introduce them.
- No `docker-compose` secrets file / no CI deploy job.

---

## 7. KNOWN ISSUES & BUGS

### Operational gotchas (verified in earlier sessions)
1. **E2E fails without ESM flag.** Running `npx jest --config ./test/jest-e2e.json` without `NODE_OPTIONS` fails with
   `Must use import to load ES Module: @nestjs/testing/index.js` — this is a **command problem**, not a code bug. Use `npm run test:e2e` (script already sets `NODE_OPTIONS=--experimental-vm-modules`).
2. **After a workspace restore, `node_modules` is gone.** The first `npx jest` may download jest 30 and then fail with `Module ts-jest in the transform option was not found`. Fix: `cd backend-app && npm ci --no-audit --no-fund`, then rerun.
3. **e2e shares a database.** A leftover row from a crashed run can break counts; never assert exact global counts, clean up by id in `afterAll`.
4. **`pg` DeprecationWarning** “Calling client.query() when the client is already executing a query” shows up repeatedly during e2e. It predates the recent work and does not fail tests (**UNVERIFIED** in this checkout; treat as noise, but worth fixing if it becomes a real concurrency bug).
5. **Prisma Dev databases are ephemeral**; `npx prisma dev ls` should show `not_running` when stopped. Do not point `.env` at another project’s database.
6. **Node version drift:** CI pins Node 22, this cloud workspace had Node 26.13.1. If something behaves differently, check Node first.

### Missing functionality / debt
7. **Cloud storage driver missing** (`src/infra/storage/README.md` documents the 5-step recipe). Local disk means uploads are lost on redeploy/ephemeral disk; also old URLs would need migration if the driver changes.
8. **No frontend tests or e2e in CI.** `.github/workflows/ci.yml` runs backend typecheck/lint/build/unit/e2e and `ng build` only. `npm test` (Vitest) is never run in CI. `npm run db:prune` is never exercised in CI (only unit/e2e coverage of its extracted functions).
9. **`prune-retention.e2e-spec.ts` has a single `it` with many assertions.** Intentional (one seeded scenario, id-pinned), but a failure only tells you “something in the 4 sections broke”; split it if diagnosis cost matters.
10. **Stale documentation** (verified):
    - `backend-app/README.md` module table still marks `ratings`, `gamification`, `settings` as “⬜ phase 2, mới có README” — all three are implemented.
    - `backend-app/src/infra/prisma/README.md` still says “chưa tạo file vì chưa chốt ORM” and shows a `PrismaClient` without the driver adapter — outdated, the real `PrismaService` uses `PrismaPg`.
    - `documents/dto/list-documents-query.dto.ts` comments `minRating` as “(phase 2)”, but it is implemented (`documents.service.ts:594`).
    - `documents.controller.ts` DELETE comment says “xóa mềm”, but the delete is **hard** (schema has no `deletedAt` on `Document`).
    - `frontend-app/README.md` is untouched Angular CLI boilerplate.
11. **No `@nestjs/config` / env schema validation** (`TODO(phase 1)` in `config/configuration.ts`); invalid values are handled per-field with fallbacks, which is deliberate but means typos can be silent.
12. **`shared/components/README.md` is the only file there** — no shared presentational components yet; duplicated markup across feature pages is possible.
13. **`@nestjs/mau` `^0.2.6`** is listed in backend `devDependencies` and its purpose is **UNVERIFIED** (not imported anywhere obvious). Treat with suspicion before adding/removing.
14. `tsconfig.build.tsbuildinfo` exists in `backend-app` (build artifact); don’t commit changes to it knowingly.
15. `.env` exists in `backend-app/` (git-ignored). **Never read it into logs, never commit it, never paste its values into a handoff or chat.**
16. ExpLog has no cascade from `User`; if user deletion is ever added, handle it explicitly.
17. `ExpReason.ADMIN_ADJUST` exists but **no endpoint** uses it yet (documented in `gamification/README.md`).
18. `settings` README notes an old `document.dailyLimit` key may still exist as a leftover DB row; it is no longer read.

---

## 8. NEXT STEPS (priority order — confirm with the owner before large items)

**0. First thing to do (baseline, no code change).**
Goal: prove the current tree is green before touching anything.
Files: none.
Commands:
```bash
cd backend-app && npm ci
# start a Postgres (docker compose up -d db, or npx prisma dev --detach --name learning-hub-e2e)
npx prisma migrate deploy
npx prisma generate
npm test
NODE_OPTIONS=--experimental-vm-modules DATABASE_URL='<url-from-prisma-dev>' npx jest --config ./test/jest-e2e.json --ci
npx tsc --noEmit -p tsconfig.json && npm run lint
cd ../frontend-app && npm ci && npm run build
```
Acceptance: 7 unit suites / 37 tests pass; 17 e2e suites / 67 tests pass; typecheck/lint/build exit 0; `git status` clean afterwards.

**1. Re-run the full e2e suite after `4f29cc6`** (only the config/script/tests changed; the previous full run was against `c090bd2`).
Acceptance: same 17/67 green; if anything fails, fix the code/test (not by weakening assertions) and report exactly what changed.

**2. Fix the stale documentation listed in §7.10.**
Files: `backend-app/README.md`, `backend-app/src/infra/prisma/README.md`, `backend-app/src/modules/documents/dto/list-documents-query.dto.ts` (comment), `backend-app/src/modules/documents/documents.controller.ts` (comment), optionally `frontend-app/README.md`.
Acceptance: no statement contradicts the code; no behavior change; typecheck/lint still pass.

**3. Run frontend tests in CI and make them reliable.**
Files: `.github/workflows/ci.yml` (frontend job), plus any flaky specs.
Acceptance: `npm test` runs in CI on Node 22 and passes; failures are real failures (no skipped tests).

**4. (Needs an external account — ask first) Implement a cloud storage driver.**
Files: `src/infra/storage/drivers/<name>.driver.ts`, `src/infra/storage/storage.module.ts`, `upload.constants.ts`/`configuration.ts` if new env vars, `.env.example`, `src/infra/storage/README.md`.
Acceptance: driver implements `StorageDriver` (`upload`, `remove`), is selected by `STORAGE_DRIVER`, uploads still pass signature validation, existing `local` tests unaffected, a new e2e or unit test covers the driver contract, and URL migration strategy is written down.

**5. Optional product items already sketched in module READMEs (confirm with owner).**
- `ExpReason.ADMIN_ADJUST`: admin manual EXP adjust endpoint (only if the product wants it).
- `document.requireApproval` setting (README sketch) — would change the “every document is reviewed” product truth, so **ask before** implementing.
- Split `prune-retention.e2e-spec.ts` into per-section `it`s if diagnosis cost becomes a problem.

**Do not start:** mobile breakpoints, a state-management library, a different ORM/stack, public document listing for guests, or a second admin UI.

---

## 9. RULES FOR THE NEXT AGENT

1. **Do not change the stack or architecture.** Angular 21 standalone + signals, Tailwind v4 + `styles.css` classes, NestJS 12 + Prisma 7 (driver adapter), PostgreSQL, custom JWT/cookie auth, custom rate limiting. No NgRx, no Material, no `@nestjs/config` unless the task is explicitly that.
2. **Read before you write.** For any module touched, read its `README.md`, controller, service, DTOs, and the matching e2e spec first. `README.md`, `PRODUCT.md`, `DESIGN.md` are the product/design source of truth.
3. **Small steps, verify each one.** After changes run the narrowest checks: `npx tsc --noEmit -p tsconfig.json`, `npm run lint`, the affected unit spec, then the affected e2e spec; full suites when the change is cross-cutting. `cd frontend-app && npm run build` for UI changes.
4. **Never weaken verification to make it pass.** Do not delete assertions, skip tests, swallow errors, or add suppressions. If a check fails, fix the cause; if a check cannot run, say so explicitly.
5. **Tests must be load-bearing.** When you add a test, prove it can fail: temporarily mutate the implementation (back up the file first), confirm the test goes red, restore, confirm green — and report the mutation results. Use `now`/cutoff parameters instead of sleeping.
6. **e2e runs on a real database.** Use `Date.now()` suffixes for unique emails/codes/publicIds, clean up in `afterAll`, assert by id, use `>=` for whole-table counts. Never rely on rows left behind by other suites.
7. **Commands matter.** Always keep `NODE_OPTIONS=--experimental-vm-modules` for Jest (scripts already set it). Use `tsx` (not `ts-node`/top-level await) for scripts. Prisma 7 needs `PrismaPg`.
8. **Secrets.** Never commit `.env`, tokens, SMTP passwords, or JWT secrets; never print them. Only env **names** belong in docs. `.env.example` gets placeholders, never real values.
9. **Docs and migrations.** Do not delete or rewrite existing migrations; add a new migration. Do not edit `src/generated/prisma` by hand — regenerate.
10. **Git.** Do **not** commit or push unless the user explicitly asks. When asked, use Conventional Commit prefixes already in the history (`feat(scope):`, `fix(scope):`, `test(scope):`, `refactor(scope):`, `docs(scope):`) and the repo’s attribution footer (`🤖 Generated with Codebuff` + `Co-Authored-By: Codebuff <noreply@codebuff.com>`) unless told otherwise. Keep the working tree clean and report the HEAD hash.
11. **UI scope.** Desktop/laptop only; reuse `styles.css` classes; keep the palette/typography in `DESIGN.md`; no new raster assets; no emoji icons. Do not “improve” untouched pages.
12. **Ask when ambiguous.** Especially before: changing product truths (approval flow, guest access, admin/student separation), schema changes, adding a dependency, or deleting data/migrations. Don’t guess silently.
13. **Report honestly.** Say what you ran, what passed, what you did not run, and what remains uncertain. Do not describe a UI as “working” if you only compiled it and never rendered it.

---

## 10. OPEN QUESTIONS

1. **Deployment target** — the repo ships Docker Compose + nginx, but there is no deploy job or host decision. Where will this run (single VPS? managed Postgres? object storage?), and is `docker compose up` the intended production path? (Affects storage driver + `TRUST_PROXY` + secrets.)
2. **Cloud storage** — do you have a Cloudinary/S3-compatible account to implement the driver against, and should existing local file URLs be migrated or kept readable in parallel?
3. **Guest browsing** — today `GET /api/documents*` requires login. Is that final product behavior, or should guests be able to browse approved documents?
4. **Frontend tests in CI** — should `npm test` (Vitest) and/or the prune script become CI gates? If yes, which ones are mandatory vs advisory?
5. **Retention windows** — the four defaults are 180 days and `retentionDays` accepts fractional values (e.g. `0.5`) by design. Is that intended, or should the parser require positive integers?
6. **Hard-delete semantics** — documents and rejected submissions are hard-deleted; there is no recovery. Is that acceptable long-term, or is an audit/soft-delete archive wanted?
7. **Admin EXP adjustment** (`ExpReason.ADMIN_ADJUST`) — is this still planned, and if so what are the rules/limits?
8. **`@nestjs/mau` devDependency** — is it intentional, and what is it used for? (UNVERIFIED; it is not obviously imported.)
9. **Node version** — should local development be pinned to Node 22 (as CI) via `.nvmrc`/`engines`, given this workspace ran Node 26?
10. **E2E isolation** — keep the shared-database model, or move to a fresh schema/database per run? (Shared is faster but can mask cross-suite leakage.)

---

## QUICK START PROMPT FOR CODEX

```
You are continuing "Learning Hub" (repo: choiieog/learning-hub), a Vietnamese document-sharing
app: Angular 21 standalone + signals + Tailwind v4 in frontend-app/, NestJS 12 + Prisma 7
(PostgreSQL, driver adapter) in backend-app/. Everything is under /api, responses are
{ success, data, timestamp }. Read README.md, PRODUCT.md, DESIGN.md, and the README.md inside
each touched backend module before coding. Read HANDOFF (this document) fully.

State: working tree is clean at commit 4f29cc6; recently added load-bearing tests for
scripts/prune-data.ts (retention + orphan uploads) against real Postgres. No work is in progress.

First task: establish a green baseline — npm ci in backend-app, start a Postgres
(docker compose up -d db or npx prisma dev), npx prisma migrate deploy, npm test (expect 7
suites / 37 tests), then the e2e suite via `npm run test:e2e` with DATABASE_URL (expect 17
suites / 67 tests), plus tsc --noEmit, npm run lint, and frontend npm run build.

Rules: don't change stack/architecture, don't commit or push unless asked, never commit .env or
secrets, don't delete migrations, keep e2e against a real DB with Date.now() suffixes and
id-pinned assertions, and prove new tests can fail by mutating the implementation. Report
exactly what you ran, what passed, and what is unverified.
```
