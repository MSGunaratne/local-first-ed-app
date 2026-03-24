import {
	environmentManager,
	type QueryClient,
	QueryClientProvider,
} from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import type { ReactNode } from "react";
import { getQueryClient, getQueryPersistenceOptions } from "@/lib/query-client";

let context:
	| {
			queryClient: QueryClient;
	  }
	| undefined;

export function getContext() {
	if (context) {
		return context;
	}

	const queryClient = getQueryClient();

	context = {
		queryClient,
	};

	return context;
}

export default function TanStackQueryProvider({
	children,
}: {
	children: ReactNode;
}) {
	const { queryClient } = getContext();
	const persistenceOptions = getQueryPersistenceOptions();

	if (environmentManager.isServer() || !persistenceOptions) {
		return (
			<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
		);
	}

	return (
		<PersistQueryClientProvider
			client={queryClient}
			persistOptions={persistenceOptions}
		>
			{children}
		</PersistQueryClientProvider>
	);
}
