import * as React from "react";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";

const SidebarContext = React.createContext<{
	state: "expanded" | "collapsed";
	open: boolean;
	setOpen: (open: boolean) => void;
	openMobile: boolean;
	setOpenMobile: (open: boolean) => void;
	isMobile: boolean;
	toggleSidebar: () => void;
} | null>(null);

function useSidebar() {
	const context = React.useContext(SidebarContext);
	if (!context) {
		throw new Error("useSidebar must be used within a SidebarProvider");
	}
	return context;
}

const SIDEBAR_COOKIE_NAME = "sidebar:state";
const SIDEBAR_WIDTH = "16rem";
const SIDEBAR_WIDTH_MOBILE = "18rem";
const SIDEBAR_WIDTH_ICON = "3rem";
const SIDEBAR_KEYBOARD_SHORTCUT = "b";

interface SidebarProviderProps extends React.ComponentProps<"div"> {
	defaultOpen?: boolean;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
}

function SidebarProvider({
	defaultOpen = true,
	open: openProp,
	onOpenChange: setOpenProp,
	className,
	style,
	children,
	ref,
	...props
}: SidebarProviderProps) {
	const isMobile = useMediaQuery("(max-width: 768px)");
	const [openMobile, setOpenMobile] = React.useState(false);

	// Internal state for desktop collapse
	const [_open, _setOpen] = React.useState(defaultOpen);

	const open = openProp ?? _open;

	React.useEffect(() => {
		const saved = localStorage.getItem(SIDEBAR_COOKIE_NAME);
		if (saved !== null) {
			const isOpen = saved === "true";
			_setOpen(isOpen);
		}
	}, []);

	const setOpen = React.useCallback(
		(value: boolean | ((value: boolean) => boolean)) => {
			const openState = typeof value === "function" ? value(open) : value;
			if (setOpenProp) {
				setOpenProp(openState);
			} else {
				_setOpen(openState);
			}

			localStorage.setItem(SIDEBAR_COOKIE_NAME, String(openState));
		},
		[setOpenProp, open],
	);

	const toggleSidebar = React.useCallback(() => {
		return isMobile ? setOpenMobile((open) => !open) : setOpen((open) => !open);
	}, [isMobile, setOpen]);

	// Keyboard shortcut
	React.useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (
				event.key === SIDEBAR_KEYBOARD_SHORTCUT &&
				(event.metaKey || event.ctrlKey)
			) {
				event.preventDefault();
				toggleSidebar();
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [toggleSidebar]);

	const state = open ? "expanded" : "collapsed";

	const contextValue = React.useMemo<
		React.ComponentProps<typeof SidebarContext.Provider>["value"]
	>(
		() => ({
			state,
			open,
			setOpen,
			isMobile,
			openMobile,
			setOpenMobile,
			toggleSidebar,
		}),
		[state, open, setOpen, isMobile, openMobile, toggleSidebar],
	);

	return (
		<SidebarContext.Provider value={contextValue}>
			<div
				style={
					{
						"--sidebar-width": SIDEBAR_WIDTH,
						"--sidebar-width-icon": SIDEBAR_WIDTH_ICON,
						"--sidebar-width-mobile": SIDEBAR_WIDTH_MOBILE,
						...style,
					} as React.CSSProperties
				}
				className={cn(
					"group/sidebar-wrapper flex min-h-screen w-full",
					className,
				)}
				ref={ref}
				{...props}
			>
				{children}
			</div>
		</SidebarContext.Provider>
	);
}

export function SidebarInset({
	className,
	...props
}: React.ComponentProps<"main">) {
	return (
		<main
			className={cn(
				"relative flex min-h-screen flex-1 flex-col bg-background transition-[margin-left] duration-300 ease-in-out peer-data-[variant=inset]:min-h-[calc(100svh-theme(spacing.4))]",
				className,
			)}
			{...props}
		/>
	);
}

export { SidebarProvider, useSidebar };
