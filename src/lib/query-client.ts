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
	persistQueryClientRestore,
	persistQueryClientSave,
	persistQueryClientSubscribe,
} from "@tanstack/react-query-persist-client";
import { del, get, set } from "idb-keyval";
import { toast } from "sonner";
import type { AppError } from "@/db/utils/errors";
import type { Session } from "@/lib/auth-client";
import {
	isPersistedQueryScope,
	PERSISTED_QUERY_SCOPES,
} from "@/types/query-cache";
import { SYNC_SCOPES } from "@/types/sync";
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
const PERSISTENCE_BUSTER = "rq-cache-v3";
const IDENTITY_STORAGE_KEY = "local-first-ed-app:cache-identity";
const AUTH_QUERY_KEY = "auth";
const AUTH_SESSION_QUERY_KEY = [AUTH_QUERY_KEY, "session"] as const;
const REPLAYED_MUTATIONS_EVENT = "OFFLINE_MUTATIONS_REPLAYED";
const REPLAYED_DEFAULT_SCOPES = SYNC_SCOPES;
const SERVICE_WORKER_READY_TIMEOUT_MS = 3_000;
const PERSISTENCE_OPERATION_TIMEOUT_MS = 3_000;

const STORAGE_BUDGET_BYTES = 50 * 1024 * 1024; // 50 MB

const STORAGE_WARNING_BYTES = 40 * 1024 * 1024; // (40 MB)

// ----------------------------------------------------------------------
// Scoped IDB Persister – one IDB key per query scope
// ----------------------------------------------------------------------

let activeCacheIdentity: string | null = null;

function withPersistenceTimeout<T>(operation: Promise<T>, label: string) {
	return new Promise<T>((resolve, reject) => {
		const timeout = setTimeout(() => {
			reject(new Error(`Persisted cache operation timed out: ${label}`));
		}, PERSISTENCE_OPERATION_TIMEOUT_MS);
		operation.then(
			(value) => {
				clearTimeout(timeout);
				resolve(value);
			},
			(error) => {
				clearTimeout(timeout);
				reject(error);
			},
		);
	});
}

function getCacheIdentity() {
	if (environmentManager.isServer()) return "server";
	activeCacheIdentity ??=
		window.localStorage.getItem(IDENTITY_STORAGE_KEY) ?? "anonymous";
	return activeCacheIdentity;
}

function getScopeKey(scope: string) {
	return `rq:v3:${getCacheIdentity()}:${scope}`;
}

function getIdentityScopeKey(identity: string, scope: string) {
	return `rq:v3:${identity}:${scope}`;
}

async function removePersistedIdentity(identity: string) {
	await Promise.all(
		[...PERSISTED_QUERY_SCOPES, "__other"].map((scope) =>
			withPersistenceTimeout(
				del(getIdentityScopeKey(identity, scope)),
				`remove ${scope}`,
			).catch(() => undefined),
		),
	);
}

async function opaqueIdentity(userId: string) {
	const bytes = new TextEncoder().encode(userId);
	const digest = await crypto.subtle.digest("SHA-256", bytes);
	return Array.from(new Uint8Array(digest), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
}

async function postServiceWorkerMessage(message: Record<string, unknown>) {
	if (!("serviceWorker" in navigator) || import.meta.env.DEV) return;

	let timeout: ReturnType<typeof setTimeout> | undefined;
	const registration = await Promise.race<ServiceWorkerRegistration | null>([
		navigator.serviceWorker.ready,
		new Promise<null>((resolve) => {
			timeout = setTimeout(
				() => resolve(null),
				SERVICE_WORKER_READY_TIMEOUT_MS,
			);
		}),
	]).finally(() => {
		if (timeout) clearTimeout(timeout);
	});
	if (!registration) return;

	const worker = navigator.serviceWorker.controller ?? registration.active;
	if (!worker) return;
	await new Promise<void>((resolve) => {
		const channel = new MessageChannel();
		const timeout = setTimeout(resolve, 3_000);
		channel.port1.onmessage = () => {
			clearTimeout(timeout);
			resolve();
		};
		worker.postMessage(message, [channel.port2]);
	});
}

export async function setQueryCacheIdentity(userId: string) {
	if (environmentManager.isServer()) return;
	const identity = await opaqueIdentity(userId);
	const previousIdentity = getCacheIdentity();
	if (previousIdentity === identity) {
		await postServiceWorkerMessage({ type: "SET_CACHE_IDENTITY", identity });
		return;
	}

	const queryClient = getQueryClient();
	const session = queryClient.getQueryData(AUTH_SESSION_QUERY_KEY);
	persistenceUnsubscribe?.();
	persistenceUnsubscribe = null;
	restorePromise = null;
	queryClient.removeQueries({
		predicate: (cachedQuery) => cachedQuery.queryKey[0] !== AUTH_QUERY_KEY,
	});
	if (previousIdentity !== "anonymous") {
		await postServiceWorkerMessage({
			type: "CLEAR_CACHE_IDENTITY",
			identity: previousIdentity,
		});
		await removePersistedIdentity(previousIdentity);
		try {
			const { deleteLocalDb, stopSyncCoordinator } = await import(
				"@/lib/local-db"
			);
			await stopSyncCoordinator();
			await deleteLocalDb();
		} catch (error) {
			console.error(
				"[Cleanup] Failed to clear the previous identity database",
				error,
			);
		}
	}
	activeCacheIdentity = identity;
	window.localStorage.setItem(IDENTITY_STORAGE_KEY, identity);
	await ensureQueryCacheRestored(queryClient);
	if (session !== undefined)
		queryClient.setQueryData(AUTH_SESSION_QUERY_KEY, session);
	await persistQueryClientSave({
		queryClient,
		persister: getBrowserPersister(),
		buster: PERSISTENCE_BUSTER,
		dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery },
	});
	await postServiceWorkerMessage({ type: "SET_CACHE_IDENTITY", identity });
}

export async function warmOfflineRoute(url = window.location.href) {
	if (environmentManager.isServer()) return;
	await postServiceWorkerMessage({ type: "WARM_AUTH_ROUTE", url });
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

			const allScopes = [...PERSISTED_QUERY_SCOPES, "__other"];
			const writes = allScopes.map(async (scope) => {
				const scopeQueries = grouped.get(scope);
				if (!scopeQueries?.length) {
					await withPersistenceTimeout(
						del(getScopeKey(scope)),
						`remove empty ${scope}`,
					).catch(() => undefined);
					return;
				}
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

				await withPersistenceTimeout(
					set(getScopeKey(scope), scopedClient),
					`persist ${scope}`,
				).catch((error) => {
					console.error(`Failed to persist scope "${scope}" to IDB`, error);
				});
			});

			await Promise.all(writes);
		},

		restoreClient: async () => {
			const allScopes = [...PERSISTED_QUERY_SCOPES, "__other"];
			const entries = await Promise.all(
				allScopes.map(async (scope) => {
					try {
						return await withPersistenceTimeout(
							get<PersistedClient>(getScopeKey(scope)),
							`restore ${scope}`,
						);
					} catch (error) {
						console.error(
							`Failed to restore scope "${scope}" from IDB, clearing it`,
							error,
						);
						// Nuke the corrupt entry rather than crashing
						await withPersistenceTimeout(
							del(getScopeKey(scope)),
							`clear invalid ${scope}`,
						).catch(() => undefined);
						return undefined;
					}
				}),
			);

			const now = Date.now();
			const validEntries = entries.filter(
				(e): e is PersistedClient =>
					e != null &&
					e.buster === PERSISTENCE_BUSTER &&
					now - e.timestamp <= CACHE_TIME,
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
				timestamp: Math.min(...validEntries.map((e) => e.timestamp)),
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
				allScopes.map((scope) =>
					withPersistenceTimeout(
						del(getScopeKey(scope)),
						`remove client ${scope}`,
					).catch(() => undefined),
				),
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
let persistenceServicesStarted = false;
let restorePromise: Promise<void> | null = null;
let persistenceUnsubscribe: (() => void) | null = null;

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
	if (persistenceServicesStarted || environmentManager.isServer()) {
		return;
	}
	persistenceServicesStarted = true;

	installReplayInvalidationListener(queryClient);

	// Log storage usage and enforce budget on startup
	void enforceStorageBudget(queryClient);
}

export function initializeQueryPersistence(queryClient: QueryClient) {
	if (environmentManager.isServer()) {
		return;
	}

	void ensureQueryCacheRestored(queryClient);
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

export async function ensureQueryCacheRestored(
	queryClient: QueryClient = getQueryClient(),
) {
	if (environmentManager.isServer()) {
		return;
	}
	startPersistenceServices(queryClient);
	restorePromise ??= (async () => {
		await persistQueryClientRestore({
			queryClient,
			persister: getBrowserPersister(),
			maxAge: CACHE_TIME,
			buster: PERSISTENCE_BUSTER,
		});
		persistenceUnsubscribe ??= persistQueryClientSubscribe({
			queryClient,
			persister: getBrowserPersister(),
			buster: PERSISTENCE_BUSTER,
			dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery },
		});
	})();
	await restorePromise;
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
	await ensureQueryCacheRestored(queryClient);
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
	const identityToClear = getCacheIdentity();

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

	await postServiceWorkerMessage({
		type: "CLEAR_CACHE_IDENTITY",
		identity: identityToClear,
	});
	activeCacheIdentity = "anonymous";
	window.localStorage.setItem(IDENTITY_STORAGE_KEY, "anonymous");
	await postServiceWorkerMessage({
		type: "SET_CACHE_IDENTITY",
		identity: "anonymous",
	});

	// 5. Stop background database work, then close and delete SQLite.
	try {
		const { deleteLocalDb, stopSyncCoordinator } = await import(
			"@/lib/local-db"
		);
		await stopSyncCoordinator();
		await deleteLocalDb();
	} catch (error) {
		console.error("[Cleanup] Failed to delete SQLite database:", error);
	}

	console.info("[Cleanup] Local data cleanup finished.");
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
