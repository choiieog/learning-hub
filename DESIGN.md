# Learning Hub — design system

## Direction

**Tidal archive.** A calm academic library carried by white paper, mist, marine and deep ink.
The landing page is the visual authority; every app surface inherits its palette, type, fine
hairlines, paper layering and pill-shaped actions. The app is an instrument for finding,
sharing and reviewing material, so expression lives in composition and precise details rather
than decoration.

## Foundations

### Colour

| Token | Hex | Use |
|---|---|---|
| `ink` | `#0E2A32` | Primary actions, rails, headings |
| `ink-soft` | `#3C5A61` | Strong body copy |
| `muted` | `#5F7A80` | Secondary copy, metadata |
| `tide` | `#26636C` | Links, active states, subject codes |
| `tide-deep` | `#18424C` | Hover on ink actions |
| `marine` | `#8FC4C8` | Active markers, chart fill, accents |
| `mist` | `#C8DCDE` | Dividers on dark, timestamps, rank rules |
| `foam` | `#EAF4F4` | Quiet fills, file marks |
| `wash` | `#F7FBFB` | Table headers, row hover |
| `canvas` | `#F4F9F9` | App background |
| `line` / `line-soft` | `#DCE9E9` / `#EAF2F2` | Borders and dividers |
| `success` | `#2E6B4F` on `#E8F3EC` | Approved state |
| `warning` | `#8A5A16` on `#FBF2DE` | Pending / waiting state |
| `danger` | `#A23B3B` on `#FAEAEA` | Destructive actions and errors |

No generic slate or indigo. Semantic green/amber/red are muted to sit inside the same archive.

### Type

Be Vietnam Pro, self-hosted from `public/fonts` in weights 400/500/600. No external font host.

- Display / page heading: 2–2.65rem, weight 600, tracking −0.04em.
- Section title: 15px, weight 600, tracking −0.015em.
- Body: 13–15px, line-height 1.7–1.8.
- Metadata: 10–12px, weight 500.
- Numbers in tables use tabular numerals. Mono is reserved for code and notation.

### Geometry

- Panels: 16px radius, 1px `line` border, white ground, no shadow. Elevation is border **or**
  shadow, never both.
- Buttons: full pills. Primary = ink, secondary = white with hairline.
- Inputs: 12px radius, white ground, `line` border, tide focus ring.
- Icons: authored inline SVG, 1.5px stroke, no emoji.
- Motion: one authored entrance on auth (paper rises, soft glow drifts), hover transitions
  elsewhere. Reduced-motion removes animation.

## Surfaces

### Landing — / (Persuade)

Unchanged. It remains the visual source. Header, hero mockup, feature stage, subject list,
privacy panel, FAQ and dark CTA follow the existing tidal system.

### Auth — /auth/* (Operate with Persuade poster)

- Desktop grid `1.08fr / 0.92fr`, full viewport, left 58% dark poster.
- Left: ink ground, dot field, marine glow, wordmark, “Mọi môn học, một thư viện.”, a labelled
  illustrative library card and the authenticated-file note.
- Right: white, focused 420px form column; back-to-home at top, legal line at bottom.
- Login, register, verify, forgot and reset share the shell. Register fits at 1280×800.

### Student shell — /dashboard, /documents, /upload, /my-documents, /leaderboard, /notifications, /profile

- 254px white rail on `line` border, sticky full height, fixed width (no collapse control),
  functions only — no account block or logout in the rail; 38px rows, 16px side padding.
- Rail groups: Bàn học / Của bạn / Cộng đồng, 12px muted group labels above 14px items.
  Active item is a foam pill with ink text; no weight jump beyond 500.
- 76px white top bar: linked breadcrumb (“Trang chủ › <page>”, with library and document/viewer levels), bell, and an
  account dropdown (Thông tin cá nhân, Đổi mật khẩu, Đăng xuất; students also get Thông báo, admins do not);
  admins also see the small “Quản trị” link. Password changes live here, never in the page masthead.
- Page mastheads are editorial: title and subtitle on their own axis, with actions moved to a
  `.page-toolbar` row underneath. No primary/secondary button shares the title’s line. Metadata
  such as totals may sit at the end of the toolbar, not beside the title. Every app page uses
  `.page-head`; pages with controls use `.page-toolbar`, while pure reading surfaces may have no
  toolbar. The library search row and the account query deck are content controls, not page
  actions, and own their row below the masthead.
- Filter/tab rows share `.filter-pills` + `.filter-pill`; active state is driven by
  `aria-pressed`. Use `.filter-pill--dense` inside the account query deck and
  `.filter-pill--warning` for the warned-only toggle. Do not hand-roll active chip colours per
  page.
- Content canvas, 24px padding, max width 1380px.
- Dashboard: greeting, an actions toolbar underneath, a seamless four-cell KPI band, a
  7-day “Nhịp chia sẻ” area chart, then recent documents beside a ranked “Đang được đọc
  nhiều” list with share bars.
- Profile: a horizontal identity band (avatar, name, role, level/join date) followed by a
  two-column information and avatar-frame grid. No password action on the page.
- Other pages inherit the same `panel`, `page-title`, status pill and field vocabulary.

### Dashboard bands

- KPI band: a flat ledger with white ground and `line` rules above/below, four equal cells,
  20–24px padding and 1px `line-soft` dividers between cells. No radius, shadow or floating
  card treatment; the band reads as part of the page, not four separate tiles.
- Analysis panels: white, `line` border, 16px radius, 24px padding, section title at 15px.
- Ranked rows carry a 4px `foam` track with a `tide` fill and a right-aligned percentage;
  progress bars stay decorative for sighted users and expose `role="progressbar"` values.
- Charts are inline SVG built from the real 7-day series — axes in `muted`, grid in
  `line-soft`, line and dot in `tide`, fill as a tide gradient fading to transparent.

### Admin console — /admin/*

- Same 254px white rail and 76px top bar as the student shell; the top bar has no role chip,
  only the account dropdown (Thông tin cá nhân, Đổi mật khẩu, Đăng xuất); max-width 1380px.
- Rail groups: Vận hành / Cộng đồng / Hệ thống; no footer account block or logout.
- Rail is explicitly an **Admin** console. There is **no** link back to the student interface;
  `studentGuard` blocks the student route tree for `ADMIN` users and redirects them to
  `/admin/dashboard`. An admin who wants the student view signs in with a student account.
- File preview in the admin context uses `/admin/viewer`, never the student `/viewer` route.
- Overview: title/subtitle only, then the four-cell ledger KPI band; the pending cell is the
  action into the queue. Top-documents ranked list, “Sức khoẻ thư viện” ratio card and a
  recent-activity table follow. No page-tab row; navigation lives in the rail and breadcrumb.
- Account management: a flat query deck above the master–detail grid. Search is a single
  primary field with an inline submit; role and status are compact filter chips, not a grid
  of labelled form controls. The first visible account is selected automatically so the
  detail column never opens as a large blank panel. Account management and document approval
  stack their master/detail columns below 1280px and use the full desktop split at 1280px+.
- Subject catalogue: a two-column index, not a table or a card grid. Mono subject codes and
  padded document counts (all statuses, including pending) are the data anchors; the status
  is written under each entry and matches the backend's delete guard. The add action is the trailing catalogue slot itself and expands in place into the
  code/name form, so this page intentionally has no page-toolbar primary action. Empty
  subjects reveal a delete action in their entry; subjects with documents do not show a dead
  disabled button. The catalogue falls back to a single column below 1280px.
- All admin pages use the same panels, fields, pills and destructive red.

## Components

`.panel`, `.panel-head`, `.panel-title`, `.panel-link`, `.page-head`, `.page-title`,
`.page-subtitle`, `.page-toolbar`, `.page-toolbar-note`, `.filter-pills`, `.filter-pill`,
`.filter-pill--dense`, `.filter-pill--warning`, `.app-shell`, `.rail`, `.rail-*`, `.topbar`,
`.topbar-btn`, `.crumb`, `.kpi-strip`, `.kpi`, `.kpi-*`, `.rank-row`, `.rank-bar`,
`.data-table`, `.data-row`, `.file-mark`, `.empty-state`, `.field-input`, `.btn-primary`,
`.btn-secondary`, `.alert-*` are defined in `frontend-app/src/styles.css`.

Use these before adding page-specific classes. Do not introduce a second card style, a new
radius, or a new accent without updating this document.

## Desktop scope

The product is desktop/laptop only: design at 1440px, verify 1280–1920px. No new mobile
breakpoints. Existing landing responsive rules remain untouched; new app surfaces use fixed
desktop grids and may scroll horizontally only if the viewport is below the stated target.

## Browser surfaces

Selection is marine on ink; focus is a 2px tide ring with 3px offset; scrollbars are mist.
Links use tide and underline on hover. Buttons name their action; pending/approved states are
written in words as well as colour.

## Assets

No new raster assets are introduced. Existing self-hosted Be Vietnam Pro files and the landing
page’s CSS-built mockup are reused. The auth library card is explicitly marked “Minh hoạ”.
