import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
export const Route = createFileRoute("/student")({ component: StudentLayout });

function StudentLayout() {
	return (
		<div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
			{/* Student Header */}
			<header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur-md px-4 h-16 flex items-center justify-between">
				<div className="flex items-center gap-2 font-bold text-lg text-primary">
					<GraduationCap className="h-6 w-6" />
					<span>Student Hub</span>
				</div>
				<div className="flex items-center gap-4">
					<Button variant="ghost" asChild>
						<Link to="/lessons">Back to Teacher Dashboard</Link>
					</Button>
				</div>
			</header>

			{/* Main Content */}
			<main className="flex-1 container mx-auto py-8 px-4 max-w-5xl">
				<Outlet />
			</main>
		</div>
	);
}
