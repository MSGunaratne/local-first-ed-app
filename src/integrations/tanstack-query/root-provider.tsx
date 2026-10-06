import {
	type QueryClient,
	QueryClientProvider,
	useQuery,
} from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";
import { authQueries } from "@/features/auth/auth.queries";
import {
	ensureQueryCacheRestored,
	setQueryCacheIdentity,
	warmOfflineRoute,
} from "@/lib/query-client";
import { reportLocalDatabaseStatus } from "@/lib/sync-status";

function SyncCoordinatorRunner() {
	const { data: session } = useQuery(authQueries.session());

	useEffect(() => {
		if (!session) {
			return;
		}

		let cleanupSync: (() => void) | undefined;
		let active = true;

		// Initialize the local-first SQLite database and sync engine
		(async () => {
			try {
				reportLocalDatabaseStatus("initializing");
				await setQueryCacheIdentity(session.user.id);
				const { initLocalDb, startSyncCoordinator } = await import(
					"@/lib/local-db"
				);
				const { registerAllMutations } = await import(
					"@/lib/mutation-registration"
				);
				const { registerServerFn } = await import("@/lib/mutation-queue");

				// 1. Register server functions for the queue first.
				registerAllMutations(registerServerFn);

				// 2. Initialize DB
				await initLocalDb();

				if (!active) {
					return;
				}

				// 3. Start the background sync orchestrator
				cleanupSync = await startSyncCoordinator();
				await warmOfflineRoute();
				reportLocalDatabaseStatus("ready");
			} catch (err) {
				console.error("[LocalDB] Initialization failed:", err);
				reportLocalDatabaseStatus(
					"error",
					err instanceof Error
						? err.message
						: "Offline storage failed to start",
				);
			}
		})();

		return () => {
			active = false;
			if (cleanupSync) {
				cleanupSync();
			}
		};
	}, [session]);

	return null;
}

function PersistenceBootstrap() {
	const [ready, setReady] = useState(false);
	useEffect(() => {
		let active = true;
		void ensureQueryCacheRestored().finally(() => {
			if (active) setReady(true);
		});
		return () => {
			active = false;
		};
	}, []);
	return ready ? <SyncCoordinatorRunner /> : null;
}

export default function TanStackQueryProvider({
	children,
	queryClient,
}: {
	children: ReactNode;
	queryClient: QueryClient;
}) {
	return (
		<QueryClientProvider client={queryClient}>
			<PersistenceBootstrap />
			{children}
		</QueryClientProvider>
	);
}
