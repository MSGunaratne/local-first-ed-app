import {
	onlineManager,
	type QueryClient,
	type QueryKey,
} from "@tanstack/react-query";
import type { SyncScope } from "@/types/sync";

type QuerySnapshot = readonly [QueryKey, unknown];

function isEffectivelyOnline() {
	return navigator.onLine !== false && onlineManager.isOnline();
}

export async function readLocalFirstList<T, TResult>(options: {
	scope: SyncScope;
	parse: (value: unknown) => T[];
	fromLocal: (items: T[]) => Promise<TResult> | TResult;
	fromServer: () => Promise<TResult>;
}): Promise<TResult> {
	if (typeof window === "undefined") return options.fromServer();
	const { getLocalAll, initLocalDb } = await import("@/lib/local-db");
	await initLocalDb();
	const local = options.parse(await getLocalAll(options.scope));
	if (local.length === 0 && isEffectivelyOnline()) {
		return options.fromServer();
	}
	return options.fromLocal(local);
}

export async function readLocalFirstDetail<T>(options: {
	scope: SyncScope;
	id: string;
	parse: (value: unknown) => T | null;
	fromServer: () => Promise<T>;
	offlineMessage: string;
}) {
	if (typeof window === "undefined") return options.fromServer();
	const { getLocalById, initLocalDb } = await import("@/lib/local-db");
	await initLocalDb();
	const local = options.parse(await getLocalById(options.scope, options.id));
	if (local) return local;
	if (!isEffectivelyOnline()) throw new Error(options.offlineMessage);
	return options.fromServer();
}

function updateMeta(meta: unknown, delta: number) {
	if (typeof meta !== "object" || meta === null) return meta;
	const next = { ...meta } as Record<string, unknown>;
	for (const key of ["itemCount", "total"] as const) {
		if (typeof next[key] === "number")
			next[key] = Math.max(0, next[key] + delta);
	}
	if (typeof next.total === "number" && typeof next.limit === "number") {
		next.pageCount = Math.ceil(next.total / next.limit);
	}
	return next;
}

export function updateListCaches<T>(
	queryClient: QueryClient,
	queryKey: QueryKey,
	update: (items: T[], key: QueryKey) => { items: T[]; countDelta: number },
) {
	const snapshots: QuerySnapshot[] = queryClient.getQueriesData({ queryKey });
	for (const [key, value] of snapshots) {
		if (typeof value !== "object" || value === null || !("data" in value))
			continue;
		const current = value as { data?: unknown; meta?: unknown };
		if (!Array.isArray(current.data)) continue;
		const result = update(current.data as T[], key);
		queryClient.setQueryData(key, {
			...current,
			data: result.items,
			meta: updateMeta(current.meta, result.countDelta),
		});
	}
	return snapshots;
}

export function restoreQuerySnapshots(
	queryClient: QueryClient,
	snapshots: readonly QuerySnapshot[],
) {
	for (const [key, value] of snapshots) queryClient.setQueryData(key, value);
}
