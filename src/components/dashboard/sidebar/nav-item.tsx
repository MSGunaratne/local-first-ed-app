import { Link, useLocation } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import type { NavItem as NavItemType } from "@/config/dashboard-nav";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { useSidebar } from "./sidebar-context";

interface NavItemProps {
	item: NavItemType;
	depth?: number;
}

export function NavItem({ item, depth = 0 }: NavItemProps) {
	const { state, isMobile } = useSidebar();
	const isCollapsed = state === "collapsed" && !isMobile;
	const location = useLocation();
	const isActive = item.path ? location.pathname === item.path : false;

	//TODO: find a better pattern later
	// @ts-ignore - dynamic key access
	const translatedTitle = (m as any)[item.title]
		? (m as any)[item.title]()
		: item.title;

	// Render Mini Version (Icon only with Tooltip or Dropdown)
	if (isCollapsed && depth === 0) {
		if (item.items && item.items.length > 0) {
			return (
				<DropdownMenu>
					<TooltipProvider delayDuration={0}>
						<Tooltip>
							<TooltipTrigger asChild>
								<DropdownMenuTrigger asChild>
									<button
										type="button"
										className={cn(
											"flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground md:h-8 md:w-8",
											isActive && "bg-accent text-accent-foreground",
										)}
									>
										{item.icon}
										<span className="sr-only">{translatedTitle}</span>
									</button>
								</DropdownMenuTrigger>
							</TooltipTrigger>
							<TooltipContent side="right" className="flex items-center gap-4">
								{translatedTitle}
							</TooltipContent>
						</Tooltip>
					</TooltipProvider>
					<DropdownMenuContent side="right" align="start" className="min-w-56">
						{item.items.map((subItem) => {
							// @ts-ignore - dynamic key access
							const subTranslatedTitle = (m as any)[subItem.title]
								? (m as any)[subItem.title]()
								: subItem.title;
							return (
								<DropdownMenuItem key={subItem.title} asChild>
									<Link to={subItem.path ?? "#"} className="cursor-pointer">
										{subItem.icon && (
											<span className="mr-2">{subItem.icon}</span>
										)}
										<span>{subTranslatedTitle}</span>
									</Link>
								</DropdownMenuItem>
							);
						})}
					</DropdownMenuContent>
				</DropdownMenu>
			);
		}

		return (
			<TooltipProvider delayDuration={0}>
				<Tooltip>
					<TooltipTrigger asChild>
						<Link
							to={item.path ?? "#"}
							className={cn(
								"flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground md:h-8 md:w-8",
								isActive && "bg-accent text-accent-foreground",
							)}
						>
							{item.icon}
							<span className="sr-only">{translatedTitle}</span>
						</Link>
					</TooltipTrigger>
					<TooltipContent side="right" className="flex items-center gap-4">
						{translatedTitle}
					</TooltipContent>
				</Tooltip>
			</TooltipProvider>
		);
	}

	// Render Vertical Version (Full width)

	// If has children, use Collapsible
	if (item.items && item.items.length > 0) {
		return (
			<Collapsible defaultOpen={isActive} className="group/collapsible">
				<CollapsibleTrigger asChild>
					<button
						type="button" // Important for accessibility
						className={cn(
							"flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=open]:text-foreground",
							// Indentation for depth
							depth > 0 && "ml-4",
						)}
					>
						{item.icon}
						<span>{translatedTitle}</span>
						<ChevronRight className="ml-auto h-4 w-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
					</button>
				</CollapsibleTrigger>
				<CollapsibleContent>
					<div className="flex flex-col gap-1 mt-1">
						{item.items.map((subItem) => (
							<NavItem key={subItem.title} item={subItem} depth={depth + 1} />
						))}
					</div>
				</CollapsibleContent>
			</Collapsible>
		);
	}

	// Simple Link
	return (
		<Link
			to={item.path ?? "#"}
			className={cn(
				"flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
				isActive && "bg-accent text-accent-foreground",
				depth > 0 && "ml-4",
			)}
		>
			{item.icon}
			<span>{translatedTitle}</span>
		</Link>
	);
}
