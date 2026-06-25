# Local First Education App

A local-first education prototype built with TanStack Start, React, Drizzle ORM, Better Auth, Cloudflare D1, and Workbox. The app supports an offline-capable student experience, a protected teacher dashboard, OCR-based PHWD curation, curriculum matching, local progress sync, and analytics.

## Project Scope

- Public student route at `/`
- Student lesson list and lesson reading flow at `/student`
- Teacher dashboard at `/dashboard`
- Lesson creation, editing, and lesson management under `/lessons`
- Public sign-in and sign-up routes
- Local-first progress and feedback sync
- First-page PDF-to-image support for PHWD uploads
- Pseudonymous analytics with local payload encryption for queued feedback/progress data

## Getting Started

Install dependencies:

```bash
pnpm install
```

Run the app locally:

```bash
pnpm dev
```

## Production Build

```bash
pnpm build
```

## Testing

```bash
pnpm test:unit
pnpm test:e2e
pnpm test:all
pnpm test:report
```

- `test:unit` runs Vitest.
- `test:e2e` runs Playwright against the production preview build.
- `test:all` runs typecheck, unit tests, build, and E2E.
- `test:report` generates `output/testing/local-first-ed-testing-outcomes.xlsx`.

To include the teacher lesson creation E2E test in a full run:

```powershell
$env:E2E_RUN_TEACHER_FLOW="1"
pnpm run test:all
pnpm run test:report
```

## Environment

Local runtime values go in `.dev.vars`. Tooling/build-time values can go in `.env.local`.

Required values:

```env
BETTER_AUTH_URL=http://localhost:3000
BETTER_AUTH_SECRET=replace-with-your-secret
```

The app uses Cloudflare D1 through Wrangler for local and production database bindings.

## Authentication

Authentication is handled by Better Auth. The teacher E2E workflow uses seeded or disposable test credentials only for automated testing.

Do not commit real credentials to the public repository.

For examiner access, use one of these options:

1. Share a private temporary login separately.
2. Create a dedicated test account and send the credentials privately.
3. Keep the repo public but document the demo login outside the repository.

The codebase should not contain live production credentials.

## Testing Notes

- Vitest covers PDF conversion, local encryption, mutation queue behaviour, analytics validation, content mapping, and component-level flows.
- Playwright covers student browsing, dashboard access control, offline fallback, mobile layout checks, and the optional teacher lesson creation workflow.
- Manual testing remains required for SUS/user study evidence and real low-end device validation.

## Thesis Notes

- Student/Class modules were intentionally not implemented because the pilot school did not want sensitive student data entered into the platform.
- Local encryption-at-rest is applied to queued feedback and progress payloads. Pseudonymous analytics remains the primary privacy control.
- PDF PHWD support is first-page only.
