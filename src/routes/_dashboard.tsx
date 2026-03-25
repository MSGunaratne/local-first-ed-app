import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Suspense } from "react";
import DashboardSidebar from "@/components/dashboard/sidebar";
import { requireAuthenticatedRoute } from "@/lib/auth/route-guards";

export const Route = createFileRoute("/_dashboard")({
	beforeLoad: async ({ location }) => {
		const session = await requireAuthenticatedRoute({
			locationHref: location.href,
		});

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
				<span className="text-sm font-medium">Loading content...</span>
			</div>
		</div>
	);
}
