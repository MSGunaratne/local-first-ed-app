import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { GraduationCap } from "lucide-react";
import ParaglideLocaleSwitcher from "@/components/LocaleSwitcher";
import { ConnectionModeToggle } from "#/components/pwa/connection-mode-toggle";
import ThemeToggle from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { authQueries } from "@/features/auth/auth.queries";

export const Route = createFileRoute("/student")({ component: StudentLayout });

function StudentLayout() {
	const { data: session } = useQuery(authQueries.session());
	const role = session?.user?.role;
	const isStaff =
		role === "teacher" || role === "admin" || role === "super-admin";

	return (
		<div className="min-h-screen bg-background text-foreground transition-colors duration-300 flex flex-col">
			{/* Student Header */}
			<header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur-md px-4 h-16 flex items-center justify-between">
				<div className="flex items-center gap-2 font-bold text-lg text-primary">
					<GraduationCap className="h-6 w-6" />
					<span>Student Hub</span>
				</div>
				<div className="flex items-center gap-2 sm:gap-3">
					{isStaff && (
						<Button variant="ghost" asChild className="whitespace-nowrap mr-1">
							<Link to="/lessons">Back to Teacher Dashboard</Link>
						</Button>
					)}
					<ParaglideLocaleSwitcher isCollapsed className="h-9 w-9 shrink-0" />
					<ThemeToggle isCollapsed className="h-9 w-9 shrink-0" />
					<ConnectionModeToggle compact className="shrink-0" />
				</div>
			</header>

			{/* Main Content */}
			<main className="flex-1 container mx-auto py-8 px-4 max-w-5xl">
				<Outlet />
			</main>
		</div>
	);
}
