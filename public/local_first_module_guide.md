# Local-First Module Guide

## Purpose

Use this guide when adding a new feature module that must support offline writes and background sync.

## Scope Example

Assume you are adding a new module named `assignments`.

## Step 1: Define Server Data Model

1. Add Drizzle schema in `src/features/assignments/assignments.schema.ts`.
2. Include sync metadata fields if the module is locally writable:
   - `syncStatus`
   - `isDeleted`
   - `updatedAt`
3. Add migration SQL and verify local and remote schema parity.

## Step 2: Add Server Functions

1. Create server actions in `src/features/assignments/assignments.actions.ts`:
   - create
   - update
   - delete
2. Include optional `idempotencyKey` in mutation inputs.
3. Apply `idempotentMiddleware` for all write functions.

## Step 3: Add Local Query and Mutation Factories

1. Create `src/features/assignments/assignments.queries.ts`.
2. Follow local-first mutation flow:
   - write to local SQLite first
   - enqueue structured mutation
   - trigger `flushMutationQueue()` as fire-and-forget if online
3. Keep mutation success immediate after local write and enqueue.

## Step 4: Register Queue Replay Handlers

1. Extend payload map in `src/lib/mutation-queue.ts`:
   - `createAssignment`
   - `updateAssignment`
   - `deleteAssignment`
2. Add runtime payload validation cases in `isValidPayloadForServerFn`.
3. Register handlers in `src/lib/mutation-registration.ts`.

## Step 5: Wire Sync Engine

1. Extend `SyncScope` in `src/lib/local-db/sync.ts`.
2. Add `COLUMN_MAP` and `TABLE_MAP` entries for the new scope.
3. If writable, include it in mutable scope flows used by:
   - `getPendingPushRecords`
   - `getPendingDeleteRecords`
4. Update sync coordinator in `src/lib/local-db/sync-coordinator.ts`:
   - add scope to `SYNC_SCOPES`
   - add create or update or delete server function mapping helpers

## Step 6: Add Pull API Support

1. Update `src/routes/api/sync/$.ts` switch handling.
2. Return updated records since cursor for the new scope.

## Step 7: Keep Types and Inference Safe

1. Avoid broad casts like `as any` or `unknown as`.
2. Prefer helper functions for narrowing unknown data.
3. Keep queue payload contracts centralized in `MutationServerFnPayloadMap`.

## Step 8: Verify

Run these checks:

1. `pnpm typecheck`
2. `pnpm lint src/features/assignments/assignments.queries.ts src/lib/mutation-queue.ts src/lib/mutation-registration.ts src/lib/local-db/sync.ts src/lib/local-db/sync-coordinator.ts`

## Step 9: Manual Offline Test

1. Force offline mode.
2. Create and update and delete an assignment.
3. Reload app while still offline and verify local data remains.
4. Go online and confirm queued mutations flush once.
5. Verify server state and local sync flags align.
