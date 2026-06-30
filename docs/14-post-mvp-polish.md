# 14-post-mvp-polish.md

# Post-MVP Polish

A running list of improvements intentionally deferred while completing the MVP
(Tasks 1–67). These are **not** required for the MVP to be correct or
demonstrable; they are recorded here so they are not forgotten. Remove an item
only when it has actually been implemented.

## Open items

- **Additional confirmation dialogs where appropriate.** e.g. a modal confirmation
  for destructive actions. Project delete currently uses a lightweight inline
  confirm, which is adequate for the MVP.
- **Structured HTTP request logging + CloudWatch integration.** Application event
  logging via `ILogger<T>` was added in Task 64; per-request access logging and a
  CloudWatch sink remain deferred (docs/12 "Logging Conventions" already notes
  CloudWatch as a later addition).
- **GitHub Actions CI/CD workflow.** Implement only after all core functionality
  is complete (build/test/lint backend + frontend, `terraform fmt`/`validate`,
  image build/push to ECR, deploy).
- **Deploy / Edit actions on the Projects list cards.** Today the list card links
  to the project and exposes Delete; Deploy and Edit live on the project detail
  page. doc 09 lists all three under the Projects page. Functional (Deploy/Edit
  are reachable via the detail page) — purely a convenience improvement.
- **Live deployment status refresh.** The deployment detail and project detail
  pages load once; a deployment in `Building` does not auto-update without a
  manual refresh. Consider lightweight polling while a deployment is non-terminal.

## Done

- **Add Logout functionality.** (Task 65) Log out is available from the desktop
  sidebar footer and the mobile menu; it clears the session and returns to `/login`.
- **Review landing page / session redirect UX.** (Task 65) An authenticated visitor
  to `/` now sees an "Open app" call-to-action (→ `/home`) instead of Login / Get
  Started; no redirect, security unchanged.
- **Shared `StatusBadge` component.** (Task 65) Extracted to
  `components/ui/status-badge.tsx` and reused across the projects, project-detail,
  deployment-detail, home, and admin pages, with a consistent colour map
  (Online = green, Failed = red, in-progress = blue, Draft/other = muted).
- **Mobile navigation.** (Task 65) The sidebar is hidden on small screens, so the
  top bar now provides a menu (navigation items + log out) — the app is navigable
  on mobile.
- **Premium UI/UX redesign.** (Task 65 — final pass) A full design-system pass: a
  brand colour palette and design tokens, Geist typography, shared primitives
  (`Card`, `StatCard`, `PageHeader`, `Skeleton`, richer `StatusBadge`), a redesigned
  landing/auth/dashboard/projects/deployments/profile/admin, brand navigation with
  avatars, and subtle motion. See docs/12 "Design System".
