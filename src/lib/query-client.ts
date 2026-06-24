import {
	defaultShouldDehydrateQuery,
	type EnsureQueryDataOptions,
	environmentManager,
	MutationCache,
	matchQuery,
	QueryClient,
	type QueryKey,
} from "@tanstack/react-query";
import {
	type PersistedClient,
	type Persister,
	persistQueryClientSave,
} from "@tanstack/react-query-persist-client";
import { del, get, set } from "idb-keyval";
import { toast } from "sonner";
import type { AppError } from "@/db/utils/errors";
import type { Session } from "@/lib/auth-client";
import {
	isPersistedQueryScope,
	PERSISTED_QUERY_SCOPES,
} from "@/types/query-cache";
import { SYNC_SCOPES } from "@/types/sync-constants";
import { fData } from "@/utils/format-number";

declare module "@tanstack/react-query" {
	interface Register {
		defaultError: AppError;
		mutationMeta: {
			successMessage?: string;
			errorMessage?: string;
			invalidates?:
				| ReadonlyArray<QueryKey>
				| ((ctx: {
						data: unknown;
						variables: unknown;
				  }) => ReadonlyArray<QueryKey>);
			onSettledCallback?: () => void;
			idempotencyKey?: string;
		};
	}
}

// ----------------------------------------------------------------------

const CACHE_TIME = 1000 * 60 * 60 * 24 * 7; // 7 days
const PERSISTENCE_BUSTER = "rq-cache-v2";
const AUTH_QUERY_KEY = "auth";
const AUTH_SESSION_QUERY_KEY = [AUTH_QUERY_KEY, "session"] as const;
const REPLAYED_MUTATIONS_EVENT = "OFFLINE_MUTATIONS_REPLAYED";
const REPLAYED_DEFAULT_SCOPES = SYNC_SCOPES;

const STORAGE_BUDGET_BYTES = 50 * 1024 * 1024; // 50 MB

const STORAGE_WARNING_BYTES = 40 * 1024 * 1024; // (40 MB)

// ----------------------------------------------------------------------
// Scoped IDB Persister – one IDB key per query scope
// ----------------------------------------------------------------------

function getScopeKey(scope: string) {
	return `rq:${scope}`;
}

function getQueryScope(
	query: Parameters<typeof defaultShouldDehydrateQuery>[0],
): string | null {
	const [scope] = query.queryKey;
	if (typeof scope === "string") {
		return scope;
	}
	return null;
}

function shouldPersistQuery(
	query: Parameters<typeof defaultShouldDehydrateQuery>[0],
) {
	const scope = getQueryScope(query);
	if (!scope) {
		return false;
	}
	if (!isPersistedQueryScope(scope)) {
		return false;
	}

	return defaultShouldDehydrateQuery(query);
}

/**
 * Creates a scoped IDB persister that stores each query scope as a separate
 * IDB key. This prevents a single corrupt entry from destroying the entire
 * cache and enables independent eviction per scope.
 */
function createScopedIDBPersister(): Persister {
	return {
		persistClient: async (client: PersistedClient) => {
			const queries = client.clientState.queries;
			const mutations = client.clientState.mutations;

			// Group queries by their first key segment (scope)
			const grouped = new Map<string, typeof queries>();
			for (const query of queries) {
				const [rawScope] = query.queryKey;
				const scope = typeof rawScope === "string" ? rawScope : "__other";
				const existing = grouped.get(scope);
				if (existing) {
					existing.push(query);
				} else {
					grouped.set(scope, [query]);
				}
			}

			const writes: Promise<void>[] = [];

			for (const [scope, scopeQueries] of grouped) {
				const scopedClient: PersistedClient = {
					timestamp: client.timestamp,
					buster: client.buster,
					clientState: {
						queries: scopeQueries,
						// Only store mutations in the first scope to avoid duplication
						mutations:
							scope === (grouped.keys().next().value ?? scope) ? mutations : [],
					},
				};

				writes.push(
					set(getScopeKey(scope), scopedClient).catch((error) => {
						console.error(`Failed to persist scope "${scope}" to IDB`, error);
					}),
				);
			}

			await Promise.all(writes);
		},

		restoreClient: async () => {
			const allScopes = [...PERSISTED_QUERY_SCOPES, "__other"];
			const entries = await Promise.all(
				allScopes.map(async (scope) => {
					try {
						return await get<PersistedClient>(getScopeKey(scope));
					} catch (error) {
						console.error(
							`Failed to restore scope "${scope}" from IDB, clearing it`,
							error,
						);
						// Nuke the corrupt entry rather than crashing
						await del(getScopeKey(scope)).catch(() => {});
						return undefined;
					}
				}),
			);

			const validEntries = entries.filter(
				(e): e is PersistedClient => e != null,
			);

			if (validEntries.length === 0) {
				return undefined;
			}

			// Merge all scoped entries back into a single PersistedClient
			const mergedQueries = validEntries.flatMap((e) => e.clientState.queries);
			const mergedMutations = validEntries.flatMap(
				(e) => e.clientState.mutations,
			);

			return {
				// Use the latest timestamp among all entries
				timestamp: Math.max(...validEntries.map((e) => e.timestamp)),
				buster: validEntries[0].buster,
				clientState: {
					queries: mergedQueries,
					mutations: mergedMutations,
				},
			};
		},

		removeClient: async () => {
			const allScopes = [...PERSISTED_QUERY_SCOPES, "__other"];
			await Promise.all(
				allScopes.map((scope) => del(getScopeKey(scope)).catch(() => {})),
			);
		},
	};
}

// ----------------------------------------------------------------------
// Storage Quota Monitoring
// ----------------------------------------------------------------------

export async function getStorageEstimate(): Promise<{
	usageBytes: number;
	quotaBytes: number;
	usagePercent: number;
}> {
	if (typeof navigator === "undefined" || !navigator.storage?.estimate) {
		return { usageBytes: 0, quotaBytes: 0, usagePercent: 0 };
	}

	const estimate = await navigator.storage.estimate();
	const usageBytes = estimate.usage ?? 0;
	const quotaBytes = estimate.quota ?? 0;
	const usagePercent = quotaBytes > 0 ? (usageBytes / quotaBytes) * 100 : 0;

	return { usageBytes, quotaBytes, usagePercent };
}

/**
 * Evict stale query cache entries when storage exceeds budget.
 * Evicts oldest stale queries first.
 */
export async function enforceStorageBudget(queryClient: QueryClient) {
	try {
		const { usageBytes } = await getStorageEstimate();

		if (
			usageBytes > STORAGE_WARNING_BYTES &&
			usageBytes <= STORAGE_BUDGET_BYTES
		) {
			console.warn(
				`[Storage] Usage (${fData(usageBytes)}) approaching budget (${fData(STORAGE_BUDGET_BYTES)})`,
			);
		}

		if (usageBytes > STORAGE_BUDGET_BYTES) {
			console.warn(
				`[Storage] Budget exceeded (${fData(usageBytes)} > ${fData(STORAGE_BUDGET_BYTES)}). Evicting stale queries.`,
			);

			const queries = queryClient.getQueryCache().getAll();
			const stale = queries
				.filter((q) => q.isStale())
				.sort((a, b) => a.state.dataUpdatedAt - b.state.dataUpdatedAt);

			// Evict the oldest half of stale queries
			const evictCount = Math.max(1, Math.ceil(stale.length / 2));
			for (const q of stale.slice(0, evictCount)) {
				queryClient.removeQueries({ queryKey: q.queryKey, exact: true });
			}

			toast.warning("Storage space is low", {
				description: "Some cached data was cleared to free up space.",
			});
		}
	} catch {
		// Silently ignore — storage API may not be available
	}
}

// ----------------------------------------------------------------------
// Error helpers
// ----------------------------------------------------------------------

function getErrorMessage(error: unknown) {
	if (error instanceof Error) {
		return error.message || error.name || "An error occurred";
	}

	if (typeof error === "string") {
		return error;
	}

	if (typeof error === "object" && error !== null) {
		const errorMessage = Reflect.get(error, "message");
		if (typeof errorMessage === "string") {
			return errorMessage;
		}
	}

	return `Unknown error: ${error}`;
}

function isCancellationError(error: unknown) {
	if (!(error instanceof Error)) {
		return false;
	}

	return (
		error.name === "AbortError" ||
		error.name === "CancelledError" ||
		error.message === "CancelledError" ||
		error.message.toLowerCase().includes("aborted")
	);
}

function getErrorStatus(error: unknown) {
	if (typeof error === "object" && error !== null && "status" in error) {
		const status = Reflect.get(error, "status");
		return typeof status === "number" ? status : null;
	}

	return null;
}

// ----------------------------------------------------------------------
// Query Client Factory
// ----------------------------------------------------------------------

function makeQueryClient() {
	// eslint-disable-next-line prefer-const
	let client: QueryClient;

	const mutationCache = new MutationCache({
		onSuccess: (data, variables, _context, mutation) => {
			const { successMessage, invalidates } = mutation.meta || {};

			if (successMessage) {
				toast.success(successMessage);
			}

			const invalidationKeys =
				typeof invalidates === "function"
					? invalidates({ data, variables })
					: invalidates;

			if (invalidationKeys?.length) {
				return client.invalidateQueries({
					predicate: (query) =>
						invalidationKeys.some((queryKey) =>
							matchQuery({ queryKey }, query),
						),
				});
			}
		},
		onError: (error, _variables, _context, mutation) => {
			if (isCancellationError(error)) {
				return;
			}

			const { errorMessage } = mutation.meta || {};

			if (errorMessage) {
				toast.error(errorMessage, {
					description: getErrorMessage(error),
				});
				console.error(error);
			}
		},

		onSettled: (_data, _error, _variables, _context, mutation) => {
			const { onSettledCallback } = mutation.meta || {};

			if (onSettledCallback) {
				onSettledCallback();
			}
		},
	});

	client = new QueryClient({
		defaultOptions: {
			queries: {
				networkMode: "offlineFirst",
				staleTime: 60 * 1000,
				// Keep gcTime >= persisted maxAge to avoid premature eviction.
				gcTime: CACHE_TIME,
				retry: (failureCount, error) => {
					if (isCancellationError(error)) {
						return false;
					}

					const status = getErrorStatus(error);
					if (status != null && status >= 400 && status < 500) {
						return false;
					}
					return failureCount < 3;
				},
			},
			mutations: {
				networkMode: "offlineFirst",
				retry: false,
			},
			dehydrate: {
				// include pending queries in dehydration
				shouldDehydrateQuery: shouldPersistQuery,
			},
		},
		mutationCache,
	});

	return client;
}

let browserQueryClient: QueryClient | undefined;
let browserPersister: Persister | undefined;
let replayListenerInstalled = false;

function getBrowserPersister() {
	if (!browserPersister) {
		browserPersister = createScopedIDBPersister();
	}

	return browserPersister;
}

function invalidateReplayScopes(
	queryClient: QueryClient,
	scopes: readonly string[],
) {
	if (scopes.length === 0) {
		return;
	}

	queryClient.invalidateQueries({
		predicate: (query) => {
			const [scope] = query.queryKey;
			return typeof scope === "string" && scopes.includes(scope);
		},
	});
}

function installReplayInvalidationListener(queryClient: QueryClient) {
	if (replayListenerInstalled || environmentManager.isServer()) {
		return;
	}

	replayListenerInstalled = true;

	navigator.serviceWorker.addEventListener("message", (event) => {
		const data = event.data as
			| {
					type?: string;
					queryScopes?: string[];
			  }
			| undefined;

		if (data?.type !== REPLAYED_MUTATIONS_EVENT) {
			return;
		}

		invalidateReplayScopes(
			queryClient,
			data.queryScopes?.length ? data.queryScopes : REPLAYED_DEFAULT_SCOPES,
		);
	});
}

function startPersistenceServices(queryClient: QueryClient) {
	if (replayListenerInstalled || environmentManager.isServer()) {
		return;
	}

	installReplayInvalidationListener(queryClient);

	// Log storage usage and enforce budget on startup
	void enforceStorageBudget(queryClient);
}

export function initializeQueryPersistence(queryClient: QueryClient) {
	if (environmentManager.isServer()) {
		return;
	}

	startPersistenceServices(queryClient);
}

export function getQueryPersistenceOptions() {
	if (environmentManager.isServer()) {
		return undefined;
	}

	return {
		persister: getBrowserPersister(),
		maxAge: CACHE_TIME,
		buster: PERSISTENCE_BUSTER,
		dehydrateOptions: {
			shouldDehydrateQuery: shouldPersistQuery,
		},
	};
}

export async function ensureQueryCacheRestored() {
	if (environmentManager.isServer()) {
		return;
	}

	const queryClient = getQueryClient();
	startPersistenceServices(queryClient);
}

export async function ensureQueryDataAfterRestore<
	TQueryFnData,
	TError = unknown,
	TData = TQueryFnData,
	TQueryKey extends readonly unknown[] = readonly unknown[],
>(
	queryClient: QueryClient,
	options: EnsureQueryDataOptions<
		TQueryFnData,
		TError,
		TData,
		TQueryKey,
		never
	>,
) {
	initializeQueryPersistence(queryClient);
	try {
		return await queryClient.ensureQueryData(options);
	} catch (error) {
		if (isCancellationError(error)) {
			const cachedData = queryClient.getQueryData<TData>(options.queryKey);
			if (typeof cachedData !== "undefined") {
				return cachedData;
			}
		}

		throw error;
	}
}

export async function clearAuthQueryState() {
	if (environmentManager.isServer()) {
		return;
	}

	const queryClient = getQueryClient();
	await ensureQueryCacheRestored();

	await queryClient.cancelQueries({ queryKey: [AUTH_QUERY_KEY] });
	queryClient.removeQueries({ queryKey: [AUTH_QUERY_KEY] });

	await persistQueryClientSave({
		queryClient,
		persister: getBrowserPersister(),
		buster: PERSISTENCE_BUSTER,
		dehydrateOptions: {
			shouldDehydrateQuery: shouldPersistQuery,
		},
	});
}

export async function getCachedAuthSession(): Promise<Session | null> {
	if (environmentManager.isServer()) {
		return null;
	}

	const queryClient = getQueryClient();
	await ensureQueryCacheRestored();
	return (
		queryClient.getQueryData<Session | null>(AUTH_SESSION_QUERY_KEY) ?? null
	);
}

export async function clearAllLocalData() {
	if (environmentManager.isServer()) {
		return;
	}

	const queryClient = getQueryClient();

	// 1. Cancel all active queries first to prevent any pending fetches from completing and writing to the cache
	await queryClient.cancelQueries();

	// 2. Clear query client cache in memory
	queryClient.clear();

	// 3. Delete the persistent cache from IndexedDB
	const persister = getBrowserPersister();
	if (persister.removeClient) {
		await persister.removeClient();
	}

	// 4. Clear the offline mutation queue
	try {
		const { clearMutationQueue } = await import("@/lib/mutation-queue");
		await clearMutationQueue();
	} catch (error) {
		console.error("[Cleanup] Failed to clear mutation queue:", error);
	}

	// 5. Delete the SQLite database
	try {
		const { deleteLocalDb } = await import("@/lib/local-db/init");
		await deleteLocalDb();
	} catch (error) {
		console.error("[Cleanup] Failed to delete SQLite database:", error);
	}

	console.info("[Cleanup] Complete local data cleanup finished.");
}

export async function resetLocalMvpData() {
	await clearAllLocalData();
	if (typeof window !== "undefined") {
		window.location.reload();
	}
}

declare global {
	interface Window {
		__RESET_LOCAL_MVP_DATA__?: typeof resetLocalMvpData;
	}
}

if (
	typeof window !== "undefined" &&
	typeof process !== "undefined" &&
	process.env.NODE_ENV === "development"
) {
	window.__RESET_LOCAL_MVP_DATA__ = resetLocalMvpData;
}

let context:
	| {
			queryClient: QueryClient;
	  }
	| undefined;

export function getContext() {
	if (environmentManager.isServer()) {
		return {
			queryClient: getQueryClient(),
		};
	}

	if (context) {
		return context;
	}

	const queryClient = getQueryClient();

	initializeQueryPersistence(queryClient);

	context = {
		queryClient,
	};

	return context;
}

export function getQueryClient() {
	if (environmentManager.isServer()) {
		// Server: always make a new query client
		return makeQueryClient();
	} else {
		// Browser: make a new query client if we don't already have one
		// This is very important, so we don't re-make a new client if React
		// suspends during the initial render. This may not be needed if we
		// have a suspense boundary BELOW the creation of the query client
		if (!browserQueryClient) {
			browserQueryClient = makeQueryClient();
			installReplayInvalidationListener(browserQueryClient);
		}
		return browserQueryClient;
	}
}
