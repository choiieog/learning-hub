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

- Panels: 16px radius, 1px `line` border, white ground, no shadow. The app shell rides on
  larger 26px surfaces and dashboard cards use a 20px radius with a soft ink shadow; keep
  these exceptions scoped to `.app-shell` / `.rail` / `.topbar` / `.dash-*`.
- Buttons: full pills. Primary = ink, secondary = white with hairline.
- Inputs: 12px radius, white ground, `line` border, tide focus ring; the topbar search is a
  white pill inside the wash header.
- Icons: authored inline SVG, 1.5px stroke, no emoji.
- Motion: the rail and topbar enter once (rail from the left, topbar from above), the active
  rail marker grows in, dashboard cards and bars stagger, and the gauge draws in. Route content
  does not add a second page-level fade. Popovers scale from their trigger; cards lift 4px on
  hover. Reduced-motion removes animation.

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

- Floating shell: 14px canvas gutter; 224px `wash` rail below 1280px, 252px above, with 26px
  radius and no border. The shell fills the viewport; the rail stays put and the main panel
  scrolls internally, so the page itself never scrolls. The rail is functions only — no
  account block or logout; 44px rows, 18px side padding, 22px icons.
- Rail groups: Bàn học / Của bạn / Cộng đồng, 11px uppercase muted labels. The active item is
  ink and semibold and carries a 5×40px `tide` marker flush to the rail's left edge; the marker
  grows from zero and the icon turns `tide`. Inactive items have no fill on hover. A 231px
  dark tide-to-ink card at the rail foot carries a short library note and one action.
- 72px `wash` topbar with 26px radius: a 380px global search pill leads (routes to
  `/documents` with `keyword`), followed by the bell and account dropdown. Admins also see a
  queue shortcut and the small “Quản trị” link. Password changes live in the account menu,
  never in the page masthead.
- Page mastheads are editorial: title and subtitle on their own axis, with actions moved to a
  `.page-toolbar` row underneath. No primary/secondary button shares the title’s line. Metadata
  such as totals may sit at the end of the toolbar, not beside the title. Every app page uses
  `.page-head`; pages with controls use `.page-toolbar`, while pure reading surfaces may have no
  toolbar. The dashboard is the exception: its two quick actions sit on the masthead axis, as in
  the card-led reference. The library search row and the account query deck are content controls,
  not page actions, and own their row below the masthead.
- Filter/tab rows share `.filter-pills` + `.filter-pill`; active state is driven by
  `aria-pressed`. Use `.filter-pill--dense` inside the account query deck and
  `.filter-pill--warning` for the warned-only toggle. Do not hand-roll active chip colours per
  page.
- Content canvas: 24px top/bottom and 22px sides, scrolling inside the main panel; max width
  1380px.
- Dashboard: greeting and quick actions on the masthead axis, four metric cards with the first
  one as a tide-to-ink hero, a seven-bar “Nhịp chia sẻ” card, a library-health gauge, then recent
  documents beside a ranked “Đang được đọc nhiều” list with share bars.
- Profile: a horizontal identity band (avatar, name, role, level/join date) followed by a
  two-column information and avatar-frame grid. No password action on the page.
- Other pages inherit the same `panel`, `page-title`, status pill and field vocabulary.

### Dashboard cards

- Metric cards: four equal cards in a 16px gap at 1280px+, two up below that, 20px radius,
  white ground with a `line` border and a soft ink shadow. The first is a tide-to-ink hero; the
  pending metric is warning-toned. Cards lift 4px on hover and carry a small circular
  open-link mark.
- Analysis cards: white, `line` border, 20px radius, 20px padding, 18px medium section titles.
  The chart card uses seven rounded bars from the real view series, with the peak bar in `tide`
  and the rest in `marine`; the health card uses a half-ring gauge split between approved
  (`tide`) and pending (`warning`).
- Ranked rows carry a 4px `foam` track with a `tide` fill and a right-aligned view count;
  progress bars stay decorative for sighted users and expose `role="progressbar"` values.
-   The student dashboard uses an 8/4 chart-and-health row, then a 7/5 recent-and-ranked row.
  The admin dashboard uses an 8/4 ranked-documents and health row, then a full-width activity
  feed. Rows become full width below 1280px and a single column below 760px.

### Admin console — /admin/*

- Same 224/252px floating rail and 72px topbar as the student shell; the admin search pill
  routes to `/admin/users` with `keyword`. The topbar has a queue shortcut and the account
  dropdown; page content remains max-width 1380px inside the 1600px shell.
- Rail groups: Vận hành / Cộng đồng / Hệ thống; labels stay short enough for the 224px rail
  (“Duyệt tài liệu”, “Môn học”, “Gửi thông báo”, “Cấu hình”). The footer card opens the queue.
- Rail is explicitly an **Admin** console. There is **no** link back to the student interface;
  `studentGuard` blocks the student route tree for `ADMIN` users and redirects them to
  `/admin/dashboard`. An admin who wants the student view signs in with a student account.
- File preview in the admin context uses `/admin/viewer`, never the student `/viewer` route.
- Overview: title/subtitle and quick actions, then four metric cards; the pending card is
  warning-toned and opens the queue. Top-documents ranked list and a “Sức khoẻ thư viện” gauge
  with account warnings follow, then a two-column recent-activity feed. No page-tab row;
  navigation lives in the rail and topbar search.
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
`.filter-pill--dense`, `.filter-pill--warning`, `.app-shell`, `.app-main`, `.app-workspace`,
`.rail`, `.rail-*`, `.topbar`, `.topbar-search`, `.topbar-btn`, `.topbar-actions`,
`.topbar-popover`, `.account-menu-trigger`, `.account-menu-panel`, `.kpi-strip`, `.kpi`,
`.kpi-*`, `.rank-row`, `.rank-bar`, `.data-table`, `.data-row`, `.file-mark`, `.empty-state`,
`.field-input`, `.btn-primary`, `.btn-secondary`, `.alert-*` are defined in
`frontend-app/src/styles.css`. The dashboard
uses its own scoped vocabulary (`.dash-*`) for cards, gauges and bars; use it only on the two
overview pages so the rest of the app keeps the flatter panel system.

Use these before adding page-specific classes. Do not introduce a second card style outside
`.dash-*`, a new radius, or a new accent without updating this document.

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
