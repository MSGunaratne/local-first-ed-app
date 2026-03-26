import { QueryClientProvider } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { type ReactNode, useEffect } from "react";
import { initializeConnectionMode } from "@/lib/connection-mode";
import { getContext, getQueryPersistenceOptions } from "@/lib/query-client";

export default function TanStackQueryProvider({
	children,
}: {
	children: ReactNode;
}) {
	const { queryClient } = getContext();
	const persistOptions = getQueryPersistenceOptions();

	useEffect(() => {
		initializeConnectionMode();
		let cleanupSync: (() => void) | undefined;

		// Initialize the local-first SQLite database and sync engine
		(async () => {
			try {
				const { initLocalDb, startSyncCoordinator } = await import(
					"@/lib/local-db"
				);
				const { registerAllMutations } = await import(
					"@/lib/mutation-registration"
				);

				// 1. Register server functions for the queue first.
				// This keeps flush paths functional even if local DB init is delayed.
				registerAllMutations();

				// 2. Initialize DB
				await initLocalDb();

				// 3. Start the background sync orchestrator
				cleanupSync = await startSyncCoordinator();
			} catch (err) {
				console.error("[LocalDB] Initialization failed:", err);
			}
		})();

		return () => {
			if (cleanupSync) cleanupSync();
		};
	}, []);

	if (!persistOptions) {
		return (
			<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
		);
	}

	return (
		<PersistQueryClientProvider
			client={queryClient}
			persistOptions={persistOptions}
		>
			{children}
		</PersistQueryClientProvider>
	);
}
