import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { Suspense } from "react";
import DashboardSidebar from "@/components/dashboard/sidebar";
import { authQueries } from "@/features/auth/auth.queries";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/_dashboard")({
	beforeLoad: async ({ context: { queryClient }, location }) => {
		const session = await queryClient.ensureQueryData(authQueries.session());

		if (!session) {
			throw redirect({
				to: "/sign-in",
				search: { returnTo: location.href },
			});
		}

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
