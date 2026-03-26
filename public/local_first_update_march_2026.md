# Local-First Implementation Update (March 2026)

## Summary

This document records the local-first hardening work completed after the initial architecture audit.

## What Was Implemented

### 1. Queue-First Mutation Pipeline

- Added application-level mutation queue replay coverage for lessons, classes, and users.
- Standardized queue registration in `src/lib/mutation-registration.ts`.
- Added typed server function payload mapping in `src/lib/mutation-queue.ts`.

### 2. Runtime Payload Safety During Replay

- Added server-function-specific payload validators in `src/lib/mutation-queue.ts`.
- Replay now validates persisted payload shape before invoking a server function.
- Added serverFn-aware entity id extraction for reconciliation instead of loose payload record casting.

### 3. Durable Idempotency

- Replaced in-memory idempotency storage with D1-backed persistence in `src/lib/idempotency.ts`.
- Updated middleware in `src/lib/server-fn.ts` to await idempotency reads and writes.

### 4. Local Sync Orchestration

- Implemented push behavior in `src/lib/local-db/sync-coordinator.ts`.
- Added operation resolution logic for create vs update during push.
- Added typed pull filtering for safe record ingestion.

### 5. Local DB Type Safety

- Added improved wa-sqlite declaration typing in `src/lib/local-db/wa-sqlite.d.ts`.
- Refactored local DB init and schema typing in:
  - `src/lib/local-db/init.ts`
  - `src/lib/local-db/schema.ts`
- Final polish: scope-aware sync typing in `src/lib/local-db/sync.ts`.

### 6. Query/Mutation Inference Cleanup

- Removed weak query cache and local-db casts in:
  - `src/features/lessons/lessons.queries.ts`
  - `src/features/classes/classes.queries.ts`
- Standardized `expectedUpdatedAt` extraction via runtime-safe helper logic.

## Validation Performed

- `pnpm typecheck`
- Focused lint runs on changed files using `pnpm lint <file paths>`

All targeted checks passed at the end of this update.

## Current Architecture Status

### Stable

- Queue-based replay with typed payload contracts.
- Runtime payload guards for replay safety.
- Durable idempotency in worker runtime.
- Sync coordinator push and pull flow.
- Local DB core typing is significantly stronger.

### Remaining Optional Improvements

- Add integration tests for offline replay and conflict handling.
- Add a shared query/mutation factory helper to reduce duplication.
- Expand typed local record shapes for feature-level query usage.
- Add user-facing sync diagnostics and conflict UI.

## Related Docs

- `public/architecture_audit.md`
- `public/local_first_module_guide.md`
