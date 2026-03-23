import { createFileRoute, Outlet } from "@tanstack/react-router";
import DashboardSidebar from "@/components/dashboard/sidebar";
import { requireAuthenticatedRoute } from "@/lib/auth/route-guards";

export const Route = createFileRoute("/_dashboard")({
	beforeLoad: async ({ context, location }) => {
		const session = await requireAuthenticatedRoute({
			queryClient: context.queryClient,
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
			<Outlet />
		</DashboardSidebar>
	);
}
