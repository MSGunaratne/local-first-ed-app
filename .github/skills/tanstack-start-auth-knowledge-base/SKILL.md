---
name: tanstack-start-auth-knowledge-base
description: Knowledge base and operating guide for authentication work in this TanStack Start app with Better Auth. Use this when changing session handling, route guards, auth server functions, role checks, or sign-in/sign-out flows.
license: Proprietary - local-first-ed-app repository
---

# Purpose

Use this skill when an agent needs to modify or debug auth behavior in this repository.

Primary goals:
- Keep auth simple, consistent, and server-authoritative.
- Avoid duplicate session fetches and client/server import leaks.
- Preserve TanStack Start idioms for protected routes and server functions.

# Project Auth Architecture (Source of Truth)

## Better Auth integration
- Auth instance: `src/lib/auth.ts`
- Mounted handler: `src/routes/api/auth/$.ts`
- Cookie bridge plugin: `tanstackStartCookies()` in `src/lib/auth.ts`

Rules:
1. `BETTER_AUTH_URL` must be present at runtime.
2. Keep `tanstackStartCookies()` as the last plugin in the plugin array.
3. Do not manually set auth cookies in app code.

## Session handling
- Canonical server reader: `readServerSession` in `src/lib/auth/session.ts`
- Canonical server requirement: `requireServerSession` in `src/lib/auth/session.ts`
- Server-function wrappers for route/client usage: `getSession` and `ensureSession` in `src/lib/auth/auth-functions.ts`

Rules:
1. Server-side domain logic should call `requireServerSession` (directly or via access helpers).
2. Route/client consumption should use the server-function/query path, not direct server imports.
3. Keep a single session query key contract in `src/features/auth/auth.queries.ts`.

## Authorization and role policy
- Centralized authz helpers: `src/lib/auth/access.ts`

Key helpers:
- `requireSession`
- `requireAdminSession`
- `requireTeacherOrAdminSession`
- `requireTeacherOwnershipOrAdmin`
- `getSessionRole`, `isAdminRole`, `isTeacherOrAdminRole`

Rules:
1. Use these helpers instead of duplicating role checks in services.
2. Use 401 semantics for unauthenticated and 403 semantics for unauthorized.

## Route protection
- Router guard helper: `src/lib/auth/route-guards.ts`
- Protected layout boundary: `src/routes/_dashboard.tsx`

Rules:
1. Protect route trees at the layout/pathless boundary with `beforeLoad`.
2. Child routes should consume route context session instead of re-checking auth.
3. Preserve return-to behavior: redirect to `/sign-in` with `returnTo` search param.

## Mutation and cache flow
- Auth mutations/queries: `src/features/auth/auth.queries.ts`
- Sign-in flow UI: `src/routes/sign-in.tsx`

Current behavior:
1. Sign-in mutation runs via server function.
2. Session query is fetched before navigating after successful sign-in.
3. Protected layout uses `queryClient.ensureQueryData(authQueries.session())`.

Guideline:
- If you change this flow, measure fetch count and ensure no unnecessary second session read during immediate post-login navigation.

# Import Boundary Rules (Critical)

TanStack Start import protection is strict.

1. Files imported by routes/components must remain client-safe.
2. Put server functions in neutral files such as `*.actions.ts` or `*.functions.ts`.
3. Keep server-only logic in service/helper files used inside server function handlers.
4. Avoid top-level imports of server-only modules in client-imported files.

# Change Strategy For Agents

When changing auth, follow this order:

1. Update canonical primitives first
- `src/lib/auth/session.ts`
- `src/lib/auth/access.ts`

2. Update route protection if needed
- `src/lib/auth/route-guards.ts`
- Protected layout route(s)

3. Update mutation/query contracts
- `src/features/auth/auth.actions.ts`
- `src/features/auth/auth.queries.ts`
- Any affected pages such as `src/routes/sign-in.tsx`

4. Migrate service consumers
- Feature service files under `src/features/**/**.service.ts`

5. Validate
- Run `pnpm typecheck`
- Run lint/check command if requested by task
- Verify redirects and return-to behavior manually when possible

# Common Mistakes To Avoid

1. Introducing multiple parallel session sources (for example query path plus independent client polling).
2. Re-adding scattered role checks outside `src/lib/auth/access.ts`.
3. Moving redirect logic from route `beforeLoad` to generic middleware without preserving router-aware `returnTo` behavior.
4. Importing server-only code into route/component-imported files.
5. Changing cookie behavior manually when Better Auth plugin already handles it.

# Troubleshooting Playbook

## Symptom: Protected route redirects unexpectedly
Check:
1. `src/lib/auth/route-guards.ts` and `queryClient.ensureQueryData` behavior.
2. Session query function in `src/features/auth/auth.queries.ts`.
3. Server session resolution in `src/lib/auth/session.ts`.

## Symptom: Session appears stale after sign-in/sign-out
Check:
1. Mutation invalidation metadata in `src/features/auth/auth.queries.ts`.
2. Post-sign-in session fetch/navigation order in `src/routes/sign-in.tsx`.
3. Any custom staleTime adjustments.

## Symptom: Build/import boundary errors
Check:
1. Whether server-only imports leaked into files imported by client routes/components.
2. Whether a server function was moved to a server-only suffixed file and imported from client code.

# Agent Output Expectations

When making auth changes, produce:
1. A concise architecture impact summary.
2. Exact files changed and why.
3. Validation evidence (at minimum `pnpm typecheck`).
4. Any residual risk or follow-up verification needed.
