import { Laptop, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";

type ThemeMode = "light" | "dark" | "auto";

const THEME_METADATA = {
	light: { label: "Light", icon: Sun },
	dark: { label: "Dark", icon: Moon },
	auto: { label: "System", icon: Laptop },
} as const satisfies Record<
	ThemeMode,
	{ label: string; icon: React.ComponentType<{ className?: string }> }
>;

function getInitialMode(): ThemeMode {
	if (typeof window === "undefined") return "auto";
	const stored = window.localStorage.getItem("theme");
	return stored === "light" || stored === "dark" || stored === "auto"
		? stored
		: "auto";
}

function applyThemeMode(mode: ThemeMode) {
	const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
	const resolved = mode === "auto" ? (prefersDark ? "dark" : "light") : mode;
	const root = document.documentElement;

	root.classList.remove("light", "dark");
	root.classList.add(resolved);

	if (mode === "auto") {
		root.removeAttribute("data-theme");
	} else {
		root.setAttribute("data-theme", mode);
	}
	root.style.colorScheme = resolved;
}

export default function ThemeToggle({
	isCollapsed = false,
	className,
}: {
	isCollapsed?: boolean;
	className?: string;
}) {
	const [mode, setMode] = useState<ThemeMode>("auto");

	useEffect(() => {
		const initialMode = getInitialMode();
		setMode(initialMode);
		applyThemeMode(initialMode);
	}, []);

	useEffect(() => {
		if (mode !== "auto") return;

		const media = window.matchMedia("(prefers-color-scheme: dark)");
		const onChange = () => applyThemeMode("auto");

		media.addEventListener("change", onChange);
		return () => media.removeEventListener("change", onChange);
	}, [mode]);

	const handleThemeChange = (newMode: ThemeMode) => {
		setMode(newMode);
		applyThemeMode(newMode);
		window.localStorage.setItem("theme", newMode);
	};

	const TriggerIcon = THEME_METADATA[mode].icon;
	const label = `Theme mode: ${THEME_METADATA[mode].label}`;

	if (isCollapsed) {
		return (
			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger asChild>
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button
									variant="ghost"
									size="icon"
									className={cn(
										"h-10 w-10 transition-transform duration-200 hover:scale-105",
										className,
									)}
								>
									<TriggerIcon className="h-5 w-5" />
									<span className="sr-only">Switch Theme</span>
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent
								align="start"
								side="right"
								className="min-w-[120px]"
							>
								{(Object.keys(THEME_METADATA) as ThemeMode[]).map(
									(themeMode) => {
										const { label: themeLabel, icon: Icon } =
											THEME_METADATA[themeMode];
										return (
											<DropdownMenuItem
												key={themeMode}
												onClick={() => handleThemeChange(themeMode)}
												className={cn(mode === themeMode && "bg-accent")}
											>
												<Icon className="mr-2 h-4 w-4" />
												<span>{themeLabel}</span>
											</DropdownMenuItem>
										);
									},
								)}
							</DropdownMenuContent>
						</DropdownMenu>
					</TooltipTrigger>
					<TooltipContent side="right" align="center">
						<span>{label}</span>
					</TooltipContent>
				</Tooltip>
			</TooltipProvider>
		);
	}

	return (
		<TooltipProvider>
			<div
				className={cn(
					"flex flex-col gap-2 p-2 w-full border rounded-lg bg-muted/30 transition-all duration-300",
					className,
				)}
			>
				<div className="flex items-center gap-2 px-1">
					<TriggerIcon className="h-4 w-4 text-muted-foreground" />
					<span className="text-sm font-semibold">Theme</span>
				</div>
				<div className="flex gap-2">
					{(Object.keys(THEME_METADATA) as ThemeMode[]).map((themeMode) => {
						const { label: themeLabel, icon: Icon } = THEME_METADATA[themeMode];
						return (
							<Tooltip key={themeMode}>
								<TooltipTrigger asChild>
									<Button
										variant={themeMode === mode ? "default" : "outline"}
										size="sm"
										className="flex-1 h-10 transition-all duration-200"
										onClick={() => handleThemeChange(themeMode)}
										aria-label={`Switch to ${themeLabel} theme`}
									>
										<Icon className="h-4 w-4" />
									</Button>
								</TooltipTrigger>
								<TooltipContent side="top" align="center">
									<span>{themeLabel} Mode</span>
								</TooltipContent>
							</Tooltip>
						);
					})}
				</div>
			</div>
		</TooltipProvider>
	);
}
