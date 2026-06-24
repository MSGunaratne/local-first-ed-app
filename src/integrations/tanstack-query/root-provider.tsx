import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { type ReactNode, useEffect } from "react";
import { authQueries } from "@/features/auth/auth.queries";
import { initializeConnectionMode } from "@/lib/connection-mode";
import { getContext, getQueryPersistenceOptions } from "@/lib/query-client";

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
			} catch (err) {
				console.error("[LocalDB] Initialization failed:", err);
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

export default function TanStackQueryProvider({
	children,
}: {
	children: ReactNode;
}) {
	const { queryClient } = getContext();
	const persistOptions = getQueryPersistenceOptions();

	useEffect(() => {
		initializeConnectionMode();
	}, []);

	if (!persistOptions) {
		return (
			<QueryClientProvider client={queryClient}>
				<SyncCoordinatorRunner />
				{children}
			</QueryClientProvider>
		);
	}

	return (
		<PersistQueryClientProvider
			client={queryClient}
			persistOptions={persistOptions}
		>
			<SyncCoordinatorRunner />
			{children}
		</PersistQueryClientProvider>
	);
}
