import { cn } from "@/lib/utils";
import { Sidebar } from "./sidebar";
import { SidebarInset, SidebarProvider } from "./sidebar-context";

interface DashboardSidebarProps {
	children?: React.ReactNode;
	className?: string; // Class for the Inset/Main area
}

export default function DashboardSidebar({
	children,
	className,
}: DashboardSidebarProps) {
	return (
		<SidebarProvider>
			<Sidebar />
			<SidebarInset className={cn("p-8 overflow-y-auto", className)}>
				{children}
			</SidebarInset>
		</SidebarProvider>
	);
}
