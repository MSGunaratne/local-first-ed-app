import {
	defaultShouldDehydrateQuery,
	isServer,
	MutationCache,
	matchQuery,
	QueryClient,
} from "@tanstack/react-query";
import {
	type PersistedClient,
	type Persister,
	persistQueryClient,
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
				shouldDehydrateQuery: (query) =>
					defaultShouldDehydrateQuery(query) ||
					query.state.status === "pending",
			},
		},
		mutationCache,
	});

	return client;
}

let browserQueryClient: QueryClient | undefined;

export function getQueryClient() {
	if (isServer) {
		// Server: always make a new query client
		return makeQueryClient();
	} else {
		// Browser: make a new query client if we don't already have one
		// This is very important, so we don't re-make a new client if React
		// suspends during the initial render. This may not be needed if we
		// have a suspense boundary BELOW the creation of the query client
		if (!browserQueryClient) {
			browserQueryClient = makeQueryClient();

			const persister = createIDBPersister();
			persistQueryClient({
				queryClient: browserQueryClient,
				persister,
				maxAge: CACHE_TIME,
				dehydrateOptions: {
					shouldDehydrateQuery: (query) =>
						defaultShouldDehydrateQuery(query) ||
						query.state.status === "pending",
				},
			});
		}
		return browserQueryClient;
	}
}
