import { createFileRoute, Link } from "@tanstack/react-router";
import {
	BookOpen,
	GraduationCap,
	LayoutDashboard,
	Plus,
	Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
		<div className="space-y-4 p-1">
			<div className="flex items-center justify-between">
				<h1 className="text-4xl font-extrabold tracking-tight">
					{m.dashboard_title()}
				</h1>
				<Link to="/lessons/create">
					<Button className="h-12 px-6 text-base font-bold gap-2 shadow-md">
						<Plus className="h-5 w-5" />
						{m.nav_lessons_create()}
					</Button>
				</Link>
			</div>

			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
				<Card className="border-2 shadow-sm relative overflow-hidden group hover:shadow-md transition-shadow">
					<div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
						<Users className="h-12 w-12" />
					</div>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-base font-bold text-muted-foreground uppercase tracking-wider">
							{m.dashboard_total_students()}
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-4xl font-black">0</div>
						<p className="text-sm font-medium text-success-foreground mt-1">
							{m.dashboard_stat_increase({ percent: "0" })}
						</p>
					</CardContent>
				</Card>
				<Card className="border-2 shadow-sm relative overflow-hidden group hover:shadow-md transition-shadow">
					<div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
						<BookOpen className="h-12 w-12" />
					</div>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-base font-bold text-muted-foreground uppercase tracking-wider">
							{m.dashboard_active_courses()}
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-4xl font-black">0</div>
						<p className="text-sm font-medium text-success-foreground mt-1">
							{m.dashboard_stat_increase({ percent: "0" })}
						</p>
					</CardContent>
				</Card>
				<Card className="border-2 shadow-sm relative overflow-hidden group hover:shadow-md transition-shadow bg-primary text-primary-foreground">
					<div className="absolute top-0 right-0 p-4 opacity-20">
						<GraduationCap className="h-12 w-12" />
					</div>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-base font-bold uppercase tracking-wider text-primary-foreground/80">
							{m.nav_lessons()}
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-4xl font-black">0</div>
						<p className="text-sm font-medium text-primary-foreground/70 mt-1">
							Lessons published
						</p>
					</CardContent>
				</Card>
			</div>

			<div className="grid gap-6 md:grid-cols-2">
				<Card className="border-2 border-primary/20 shadow-lg bg-gradient-to-br from-primary/5 to-background">
					<CardHeader className="pb-4">
						<CardTitle className="text-2xl font-bold flex items-center gap-3">
							<div className="h-10 w-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground shadow-inner">
								<LayoutDashboard className="h-5 w-5" />
							</div>
							{m.dashboard_welcome_title()}
						</CardTitle>
						<CardDescription className="text-lg mt-2 leading-relaxed">
							{m.dashboard_welcome_description()}
						</CardDescription>
					</CardHeader>
					<CardContent className="pt-4 flex flex-wrap gap-4">
						<Link to="/lessons/create">
							<Button
								variant="default"
								className="h-12 px-6 text-base font-bold"
							>
								{m.lessons_add_button()}
							</Button>
						</Link>
						<Link to="/lessons">
							<Button
								variant="outline"
								className="h-12 px-6 text-base font-semibold"
							>
								View All Lessons
							</Button>
						</Link>
					</CardContent>
				</Card>

				<Card className="border-2 shadow-sm border-dashed">
					<CardHeader>
						<CardTitle className="text-xl font-bold">Getting Started</CardTitle>
						<CardDescription>
							Follow these steps to set up your classroom.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="flex items-start gap-4 p-3 rounded-lg bg-muted/50">
							<div className="h-8 w-8 rounded-full bg-accent flex items-center justify-center text-accent-foreground font-bold shrink-0">
								1
							</div>
							<div>
								<p className="font-bold">Register your students</p>
								<p className="text-sm text-muted-foreground">
									Add students to your dashboard to track their progress.
								</p>
							</div>
						</div>
						<div className="flex items-start gap-4 p-3 rounded-lg bg-muted/50">
							<div className="h-8 w-8 rounded-full bg-accent flex items-center justify-center text-accent-foreground font-bold shrink-0">
								2
							</div>
							<div>
								<p className="font-bold">Create your first lesson</p>
								<p className="text-sm text-muted-foreground">
									Use our easy editor to create engaging lessons.
								</p>
							</div>
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
