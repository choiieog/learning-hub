# Learning Hub

## What it is

A shared academic library for Vietnamese university students. Students upload lecture notes,
syllabi and exam material; an admin reviews every document before it appears publicly. Files are
served through authenticated endpoints, not public links.

## Who uses it

- **Students** arrive between classes or while revising, usually on a laptop. They need to find
  the right subject fast, read a file in place and know what they have shared.
- **Admins** work through a review queue, manage subjects and accounts, and send announcements.
  Their surface is an operations console, not a student view with extra buttons.

## Jobs the interface must keep

- Find approved material by subject, file type and keyword.
- Upload a document and follow its `PENDING` / `APPROVED` state.
- Read a file; author and admins can access a pending file, other students cannot.
- Manage profile, notifications, leaderboard and password.
- Review pending documents, users, subjects, broadcasts and system settings as an admin.

## Product truths

- Every document is reviewed before it is public.
- A pending document is visible only to its author and admins.
- The landing page is the brand authority: white paper, mist `#C8DCDE`, marine `#8FC4C8`,
  deep ink `#0E2A32`, tide `#26636C`, Be Vietnam Pro.
- Admin and student surfaces are separate. An admin who wants the student experience signs in
  with a student account.
- Desktop/laptop is the target: 1280–1920 px, designed at 1440 px. Existing mobile behavior is
  left untouched; no new mobile breakpoints.

## Assumptions

- Copy and sample content already in the product are product truth; no commercial claims,
  testimonials or new statistics are invented for this redesign.
- The landing page stays the visual source. The app inherits its palette, type, hairline borders,
  paper/mist layering and pill-shaped actions.
- Student home becomes a working dashboard; admin home remains an operations overview with the
  same visual system but a distinct rail and no cross-link to the student UI.
