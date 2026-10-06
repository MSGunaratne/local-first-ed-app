import { Menu } from "lucide-react";
import type { Session } from "#/lib/auth-client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Sidebar } from "./sidebar";
import { SidebarInset, SidebarProvider, useSidebar } from "./sidebar-context";

interface DashboardSidebarProps {
	children?: React.ReactNode;
	className?: string; // Class for the Inset/Main area
	session: Session;
}

function DashboardSidebarContent({
	children,
	className,
	session,
}: DashboardSidebarProps) {
	const { isMobile, setOpenMobile } = useSidebar();

	return (
		<>
			<Sidebar session={session} />
			<SidebarInset
				className={cn(
					"flex flex-col flex-1 h-screen overflow-hidden",
					className,
				)}
			>
				{isMobile && (
					<header className="h-14 border-b bg-background flex items-center px-4 gap-3 shrink-0 select-none">
						<Button
							variant="ghost"
							size="icon"
							className="h-9 w-9 text-muted-foreground hover:text-foreground"
							onClick={() => setOpenMobile(true)}
						>
							<Menu className="h-5 w-5" />
							<span className="sr-only">Open menu</span>
						</Button>
						<span className="font-bold text-sm">
							{session?.user?.role === "admin" ? "Admin Panel" : "Teacher Hub"}
						</span>
					</header>
				)}
				<div className="flex-1 overflow-y-auto p-4 md:p-8">{children}</div>
			</SidebarInset>
		</>
	);
}

export default function DashboardSidebar({
	children,
	className,
	session,
}: DashboardSidebarProps) {
	return (
		<SidebarProvider>
			<DashboardSidebarContent className={className} session={session}>
				{children}
			</DashboardSidebarContent>
		</SidebarProvider>
	);
}
