import type { Session } from "#/lib/auth-client";
import { cn } from "@/lib/utils";
import { Sidebar } from "./sidebar";
import { SidebarInset, SidebarProvider } from "./sidebar-context";

interface DashboardSidebarProps {
	children?: React.ReactNode;
	className?: string; // Class for the Inset/Main area
	session: Session;
}

export default function DashboardSidebar({
	children,
	className,
	session,
}: DashboardSidebarProps) {
	return (
		<SidebarProvider>
			<Sidebar session={session} />
			<SidebarInset className={cn("p-8 overflow-y-auto", className)}>
				{children}
			</SidebarInset>
		</SidebarProvider>
	);
}
