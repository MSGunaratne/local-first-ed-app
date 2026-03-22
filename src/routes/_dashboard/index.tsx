import { createFileRoute } from "@tanstack/react-router";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/_dashboard/")({
	component: DashboardIndex,
});

function DashboardIndex() {
	return (
		<div className="space-y-4">
			<h1 className="text-3xl font-bold tracking-tight">
				{m.dashboard_title()}
			</h1>
			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">
							{m.dashboard_total_students()}
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">0</div>
						<p className="text-xs text-muted-foreground">
							{m.dashboard_stat_increase({ percent: "0" })}
						</p>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">
							{m.dashboard_active_courses()}
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">0</div>
						<p className="text-xs text-muted-foreground">
							{m.dashboard_stat_increase({ percent: "0" })}
						</p>
					</CardContent>
				</Card>
			</div>
			<Card>
				<CardHeader>
					<CardTitle>{m.dashboard_welcome_title()}</CardTitle>
					<CardDescription>{m.dashboard_welcome_description()}</CardDescription>
				</CardHeader>
			</Card>
		</div>
	);
}
