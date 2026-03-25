import { Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cycleConnectionMode, useConnectionMode } from "@/lib/connection-mode";
import { cn } from "@/lib/utils";

interface ConnectionModeToggleProps {
	className?: string;
	compact?: boolean;
}

export function ConnectionModeToggle({
	className,
	compact = false,
}: ConnectionModeToggleProps) {
	const { mode, isOnline, isForced } = useConnectionMode();
	const displayedStatus = isOnline ? "Online" : "Offline";
	const modeLabel =
		mode === "auto" ? "Auto" : mode === "offline" ? "Forced off" : "Forced on";
	const Icon = isOnline ? Wifi : WifiOff;

	return (
		<Button
			type="button"
			variant="outline"
			size={compact ? "icon" : "default"}
			className={cn(
				"border-dashed bg-background/80 hover:bg-accent/50",
				compact ? "h-9 w-9" : "w-full justify-between gap-3 px-3",
				className,
			)}
			onClick={cycleConnectionMode}
			title="Cycle connection mode"
			aria-label={`Connection ${displayedStatus}, mode ${modeLabel}. Click to cycle mode.`}
		>
			<span className="flex items-center gap-2 min-w-0">
				<Icon className="h-4 w-4 shrink-0" />
				{!compact && (
					<span className="truncate font-medium">
						{displayedStatus}
						<span className="ml-2 text-muted-foreground font-normal">
							({modeLabel})
						</span>
					</span>
				)}
			</span>
			{!compact && (
				<span
					className={cn(
						"rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider",
						isForced
							? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
							: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
					)}
				>
					{modeLabel}
				</span>
			)}
		</Button>
	);
}
