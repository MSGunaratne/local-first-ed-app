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
