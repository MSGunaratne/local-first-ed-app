import { Link } from "@tanstack/react-router";
import { PanelLeft } from "lucide-react";
import type { Session } from "#/lib/auth-client";
import ParaglideLocaleSwitcher from "@/components/LocaleSwitcher";
import { ConnectionModeToggle } from "@/components/pwa/connection-mode-toggle";
import { Button } from "@/components/ui/button";
import { navConfig } from "@/config/dashboard-nav";
import BetterAuthHeader from "@/integrations/better-auth/header-user";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import ThemeToggle from "@/components/ThemeToggle";
import { NavItem } from "./nav-item";
import { useSidebar } from "./sidebar-context";

export function Sidebar({
	className,
	session,
}: React.ComponentProps<"aside"> & { session: Session }) {
	const { state, isMobile, openMobile, setOpenMobile, toggleSidebar } =
		useSidebar();
	const isCollapsed = state === "collapsed";

	return (
		<>
			{/* Mobile Overlay */}
			{isMobile && openMobile && (
				<button
					type="button"
					data-sidebar="overlay"
					className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm"
					onClick={() => setOpenMobile(false)}
					aria-label={m.nav_close_sidebar()}
				/>
			)}

			<aside
				data-state={state}
				className={cn(
					"inset-y-0 left-0 z-50 flex h-screen flex-col bg-background border-r transition-[width] duration-300 ease-in-out",
					isMobile
						? cn(
								"fixed",
								"w-[var(--sidebar-width-mobile)]",
								!openMobile && "-translate-x-full",
							)
						: cn(
								"sticky top-0",
								isCollapsed
									? "w-[var(--sidebar-width-icon)]"
									: "w-[var(--sidebar-width)]",
							),
					className,
				)}
			>
				<div
					className={cn(
						"h-14 flex items-center border-b px-2",
						isCollapsed ? "justify-center" : "justify-between px-4",
					)}
				>
					{!isCollapsed && (
						<Link
							to="/dashboard"
							className="flex items-center gap-2 font-bold text-lg"
						>
							<img
								src="/iit-logo.webp"
								alt={m.common_app_title()}
								className="h-6"
							/>
						</Link>
					)}

					{!isMobile && (
						<Button
							variant="ghost"
							size="icon"
							className={cn(
								"h-8 w-8 text-muted-foreground hover:text-foreground",
								isCollapsed && "mx-auto",
							)}
							onClick={toggleSidebar}
						>
							<PanelLeft className="h-4 w-4" />
							<span className="sr-only">{m.nav_toggle_sidebar()}</span>
						</Button>
					)}

					{/* Mobile Close Button would be here if needed, but overlay click handles it or we add explicit X */}
				</div>

				{/* Nav Items */}
				<div className="flex-1 overflow-auto py-4">
					<nav className="flex flex-col gap-1 px-2">
						{navConfig.map((item) => (
							<NavItem key={item.title} item={item} />
						))}
					</nav>
				</div>

				{/* Footer */}
				<div className="border-t p-2">
					<div
						className={cn(
							"flex flex-col gap-2",
							isCollapsed ? "items-center" : "items-stretch",
						)}
					>
						<ParaglideLocaleSwitcher isCollapsed={isCollapsed} />
						<ThemeToggle isCollapsed={isCollapsed} />
						<BetterAuthHeader session={session} />
					</div>
				</div>

				<div className="mt-auto border-t p-2 pt-6">
					<ConnectionModeToggle compact={isCollapsed} />
				</div>
			</aside>
		</>
	);
}
