import {
	defaultShouldDehydrateQuery,
	type EnsureQueryDataOptions,
	environmentManager,
	MutationCache,
	matchQuery,
	QueryClient,
} from "@tanstack/react-query";
import {
	type PersistedClient,
	type Persister,
	persistQueryClientRestore,
	persistQueryClientSave,
} from "@tanstack/react-query-persist-client";
import { del, get, set } from "idb-keyval";
import { toast } from "sonner";
import type { AppError } from "@/db/utils/errors";

declare module "@tanstack/react-query" {
	interface Register {
		defaultError: AppError;
		mutationMeta: {
			successMessage?: string;
			errorMessage?: string;
			invalidates?: Array<readonly string[]>;
			getInvalidates?: (data: unknown) => Array<readonly string[]>;
			onSettledCallback?: () => void;
		};
	}
}

// ----------------------------------------------------------------------
// IndexedDB Persister for offline-first support
// ----------------------------------------------------------------------

function createIDBPersister(
	idbValidKey: IDBValidKey = "reactQuery",
): Persister {
	return {
		persistClient: async (client: PersistedClient) => {
			try {
				await set(idbValidKey, client);
			} catch (error) {
				console.error("Failed to persist query client to IDB", error);
			}
		},
		restoreClient: async () => {
			try {
				return await get<PersistedClient>(idbValidKey);
			} catch (error) {
				console.error("Failed to restore query client from IDB", error);
				return undefined;
			}
		},
		removeClient: async () => {
			await del(idbValidKey);
		},
	};
}

// ----------------------------------------------------------------------

function getErrorMessage(error: unknown) {
	if (error instanceof Error) {
		return error.message || error.name || "An error occurred";
	}

	if (typeof error === "string") {
		return error;
	}

	if (typeof error === "object" && error !== null) {
		const errorMessage = (error as { message?: string }).message;
		if (typeof errorMessage === "string") {
			return errorMessage;
		}
	}

	return `Unknown error: ${error}`;
}

// Cache time: 7 days for offline-first support
const CACHE_TIME = 1000 * 60 * 60 * 24 * 7;
const PERSISTENCE_BUSTER = "rq-cache-v1";
const AUTH_QUERY_KEY = "auth";
const REPLAYED_MUTATIONS_EVENT = "OFFLINE_MUTATIONS_REPLAYED";
const REPLAYED_DEFAULT_SCOPES = ["users", "lessons", "classes"] as const;

function shouldPersistQuery(
	query: Parameters<typeof defaultShouldDehydrateQuery>[0],
) {
	const [scope] = query.queryKey;
	if (scope === AUTH_QUERY_KEY) {
		return false;
	}

	return defaultShouldDehydrateQuery(query) || query.state.status === "pending";
}

function makeQueryClient() {
	// eslint-disable-next-line prefer-const
	let client: QueryClient;

	const mutationCache = new MutationCache({
		onSuccess: (data, _variables, _context, mutation) => {
			const { successMessage, invalidates, getInvalidates } =
				mutation.meta || {};

			if (successMessage) {
				toast.success(successMessage);
			}

			const allInvalidates = [
				...(invalidates ?? []),
				...(getInvalidates?.(data) ?? []),
			];

			if (allInvalidates.length > 0) {
				client.invalidateQueries({
					predicate: (query) =>
						allInvalidates.some((queryKey) => matchQuery({ queryKey }, query)),
				});
			}
		},
		onError: (error, _variables, _context, mutation) => {
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
					if (error.status >= 400 && error.status < 500) {
						return false;
					}
					return failureCount < 3;
				},
			},
			mutations: {
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
let restorePromise: Promise<void> | undefined;
let browserPersister: Persister | undefined;
let replayListenerInstalled = false;

function getBrowserPersister() {
	if (!browserPersister) {
		browserPersister = createIDBPersister();
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

function startPersistence(queryClient: QueryClient) {
	if (!restorePromise) {
		const persister = getBrowserPersister();
		restorePromise = persistQueryClientRestore({
			queryClient,
			persister,
			maxAge: CACHE_TIME,
			buster: PERSISTENCE_BUSTER,
		}).then(() => {
			// Discard any auth data from older persisted snapshots.
			queryClient.removeQueries({ queryKey: [AUTH_QUERY_KEY] });
		});
	}

	installReplayInvalidationListener(queryClient);

	return restorePromise;
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
	await startPersistence(queryClient);
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
	await ensureQueryCacheRestored();
	return queryClient.ensureQueryData(options);
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
