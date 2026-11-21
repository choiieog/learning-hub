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

- 264px ink rail, sticky full height.
- Rail groups: Bàn học / Của bạn / Cộng đồng. Active item uses a white 10% field.
- 68px white top bar with breadcrumb, bell and (for admins only) a small “Quản trị” link.
- Content canvas, 32–40px padding, max width 1380px.
- Dashboard: greeting + actions, five-cell metric strip, recent-document panel, 7-day sharing
  rhythm, a full-width pending strip when needed, then a ranked library table.
- Other pages inherit the same `panel`, `page-title`, status pill and field vocabulary.

### Admin console — /admin/*

- 248px ink rail, 64px top bar, max-width 1380px.
- Rail is explicitly an **Admin** console. There is **no** link back to the student interface;
  `studentGuard` blocks the student route tree for `ADMIN` users and redirects them to
  `/admin/dashboard`. An admin who wants the student view signs in with a student account.
- File preview in the admin context uses `/admin/viewer`, never the student `/viewer` route.
- Overview: four-cell metric strip, top-documents panel, recent-activity panel.
- All admin pages use the same panels, fields, pills and destructive red.

## Components

`.panel`, `.panel-head`, `.panel-title`, `.panel-link`, `.metric-strip`, `.metric`,
`.metric-value`, `.metric-label`, `.metric-hint`, `.status-pill`, `.status-approved`,
`.status-pending`, `.data-row`, `.file-mark`, `.empty-state`, `.field-input`, `.btn-primary`,
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
