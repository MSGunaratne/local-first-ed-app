import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { Suspense } from "react";
import DashboardSidebar from "@/components/dashboard/sidebar";
import { authQueries } from "@/features/auth/auth.queries";
import type { Session } from "@/lib/auth-client";
import {
	ensureQueryCacheRestored,
	getCachedAuthSession,
	setQueryCacheIdentity,
} from "@/lib/query-client";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/_dashboard")({
	beforeLoad: async ({ context: { queryClient }, location }) => {
		await ensureQueryCacheRestored(queryClient);
		let session: Session | null | undefined;

		try {
			session = await queryClient.ensureQueryData(authQueries.session());
		} catch (error) {
			session = await getCachedAuthSession();
			if (!session) {
				throw error;
			}
		}

		if (!session) {
			throw redirect({
				to: "/sign-in",
				search: { returnTo: location.href },
			});
		}

		// Finish the user-scoped cache transition before child route loaders can
		// create queries. Otherwise the transition may remove an active loader query.
		await setQueryCacheIdentity(session.user.id);

		return { session };
	},
	component: DashboardLayout,
});

function DashboardLayout() {
	const { session } = Route.useRouteContext();

	return (
		<DashboardSidebar
			session={session}
			className="bg-gray-100 dark:bg-gray-950"
		>
			<Suspense fallback={<DashboardOutletFallback />}>
				<Outlet />
			</Suspense>
		</DashboardSidebar>
	);
}

function DashboardOutletFallback() {
	return (
		<div className="flex min-h-[40vh] items-center justify-center px-4">
			<div className="flex items-center gap-2 text-muted-foreground">
				<div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
				<span className="text-sm font-medium">
					{m.common_loading_content()}
				</span>
			</div>
		</div>
	);
}
