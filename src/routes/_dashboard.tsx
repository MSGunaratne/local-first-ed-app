import { createFileRoute, Outlet } from "@tanstack/react-router";
import DashboardSidebar from "@/components/dashboard/sidebar";
import { authMiddleware } from "@/lib/middleware";

export const Route = createFileRoute("/_dashboard")({
	component: DashboardLayout,
	server: {
		middleware: [authMiddleware],
	},
});

function DashboardLayout() {
	return (
		<DashboardSidebar className="bg-gray-100 dark:bg-gray-950">
			<Outlet />
		</DashboardSidebar>
	);
}
