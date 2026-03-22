import { Link, useNavigate } from "@tanstack/react-router";
import { LogOut, User } from "lucide-react";
import { useEffect, useState } from "react";
import { useSidebar } from "@/components/dashboard/sidebar/sidebar-context";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut } from "#/features/auth/action";
import { cn } from "@/lib/utils";
import { authClient } from "#/lib/auth-client";

export default function BetterAuthHeader() {
	const { data: session, isPending } = authClient.useSession();
	const navigate = useNavigate();
	const { state, isMobile } = useSidebar();
	const isCollapsed = state === "collapsed" && !isMobile;

	// Hydration fix
	const [hasMounted, setHasMounted] = useState(false);
	useEffect(() => {
		setHasMounted(true);
	}, []);

	const handleSignOut = async () => {
		await signOut({ returnTo: "/sign-in" });
		//navigate({ to: "/sign-in" });
	};

	// Fallback Initials
	const getInitials = (name?: string) => {
		return name ? name.substring(0, 2).toUpperCase() : "U";
	};

	if (!hasMounted || isPending) {
		return (
			<div
				className={cn(
					"h-9 w-full rounded-md bg-muted animate-pulse",
					isCollapsed && "h-10 w-10 rounded-full",
				)}
			/>
		);
	}

	if (session?.user) {
		return (
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="ghost"
						className={cn(
							"relative h-auto p-2 w-full justify-start gap-2",
							isCollapsed && "h-10 w-10 p-0 justify-center",
						)}
					>
						<Avatar className="h-8 w-8">
							<AvatarFallback>{getInitials(session.user.name)}</AvatarFallback>
						</Avatar>

						{!isCollapsed && (
							<div className="flex flex-col items-start text-sm leading-tight group-data-[collapsible=icon]:hidden">
								<span className="truncate font-semibold">
									{session.user.name}
								</span>
								<span className="truncate text-xs text-muted-foreground">
									{session.user.email}
								</span>
							</div>
						)}
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent
					className="w-56"
					align="end"
					side={isCollapsed ? "right" : "bottom"}
				>
					<DropdownMenuLabel className="font-normal">
						<div className="flex flex-col space-y-1">
							<p className="text-sm font-medium leading-none">
								{session.user.name}
							</p>
							<p className="text-xs leading-none text-muted-foreground">
								{session.user.email}
							</p>
						</div>
					</DropdownMenuLabel>
					<DropdownMenuSeparator />
					<DropdownMenuItem onClick={handleSignOut}>
						<LogOut className="mr-2 h-4 w-4" />
						<span>Log out</span>
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		);
	}

	return (
		<Button
			asChild
			variant="secondary"
			className={cn(
				"w-full justify-start",
				isCollapsed && "justify-center px-0",
			)}
		>
			<Link to="/demo/better-auth">
				{isCollapsed ? <User className="h-4 w-4" /> : "Sign in"}
			</Link>
		</Button>
	);
}
