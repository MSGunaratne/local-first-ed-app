import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { GraduationCap, Settings } from "lucide-react";
import { ConnectionModeToggle } from "#/components/pwa/connection-mode-toggle";
import ParaglideLocaleSwitcher from "@/components/LocaleSwitcher";
import ThemeToggle from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authQueries } from "@/features/auth/auth.queries";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/student")({ component: StudentLayout });

function StudentLayout() {
	return (
		<StudentShell>
			<Outlet />
		</StudentShell>
	);
}

export function StudentShell({ children }: { children: React.ReactNode }) {
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
					<span>{m.student_hub()}</span>
				</div>
				<div className="flex items-center gap-2">
					<Button
						variant="ghost"
						asChild
						className="whitespace-nowrap text-sm truncate mr-1"
					>
						{isStaff ? (
							<Link to="/dashboard">{m.student_back_to_dashboard()}</Link>
						) : (
							<Link to="/sign-in" search={{ returnTo: "/dashboard" }}>
								{m.student_teacher_dashboard()}
							</Link>
						)}
					</Button>

					{/* Mobile Settings Dropdown */}
					<div className="flex md:hidden">
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button variant="outline" size="icon" className="h-9 w-9">
									<Settings className="h-4 w-4" />
									<span className="sr-only">Settings</span>
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end" className="w-56 p-3 space-y-3">
								<div className="text-xs font-semibold text-muted-foreground select-none px-1">
									{m.student_preferences_label()}
								</div>
								<div className="flex flex-col gap-2">
									<div className="flex items-center justify-between text-sm">
										<span>{m.common_language_label()}</span>
										<ParaglideLocaleSwitcher
											isCollapsed
											className="h-9 w-9 shrink-0"
										/>
									</div>
									<div className="flex items-center justify-between text-sm">
										<span>{m.common_theme_label()}</span>
										<ThemeToggle isCollapsed className="h-9 w-9 shrink-0" />
									</div>
									<div className="flex items-center justify-between text-sm border-t pt-2 mt-1">
										<span>{m.student_status_label()}</span>
										<ConnectionModeToggle compact className="shrink-0" />
									</div>
								</div>
							</DropdownMenuContent>
						</DropdownMenu>
					</div>

					{/* Desktop Controls */}
					<div className="hidden md:flex items-center gap-2 sm:gap-3">
						<ParaglideLocaleSwitcher isCollapsed className="h-9 w-9 shrink-0" />
						<ThemeToggle isCollapsed className="h-9 w-9 shrink-0" />
						<ConnectionModeToggle compact className="shrink-0" />
					</div>
				</div>
			</header>

			{/* Main Content */}
			<main className="flex-1 container mx-auto py-8 px-4 max-w-5xl">
				{children}
			</main>
		</div>
	);
}
