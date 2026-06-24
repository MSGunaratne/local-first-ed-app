import { CloudOff, Loader2, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cycleConnectionMode, useConnectionMode } from "@/lib/connection-mode";
import { useSyncStatus } from "@/lib/sync-status";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";

interface ConnectionModeToggleProps {
	className?: string;
	compact?: boolean;
}

export function ConnectionModeToggle({
	className,
	compact = false,
}: ConnectionModeToggleProps) {
	const { mode, isOnline, isForced } = useConnectionMode();
	const {
		hasPendingMutations,
		hasFailedMutations,
		totalPending,
		totalFailed,
		lastSyncFormatted,
		storageUsageFormatted,
	} = useSyncStatus();

	const displayedStatus = isOnline ? m.common_online() : m.common_offline();
	const modeLabel =
		mode === "auto"
			? m.common_auto()
			: mode === "offline"
				? m.common_forced_off()
				: m.common_forced_on();

	const Icon = hasFailedMutations
		? CloudOff
		: hasPendingMutations
			? Loader2
			: isOnline
				? Wifi
				: WifiOff;

	return (
		<div className={cn("flex flex-col gap-1", className)}>
			<Button
				type="button"
				variant="outline"
				size={compact ? "icon" : "default"}
				className={cn(
					"border-dashed bg-background/80 hover:bg-accent/50",
					compact ? "h-9 w-9" : "w-full justify-between gap-3 px-3",
				)}
				onClick={cycleConnectionMode}
				title={m.common_cycle_connection_mode()}
				aria-label={m.common_connection_status({
					status: displayedStatus,
					mode: modeLabel,
				})}
			>
				<span className="flex items-center gap-2 min-w-0">
					<Icon
						className={cn(
							"h-4 w-4 shrink-0",
							hasPendingMutations && "animate-spin",
						)}
					/>
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

			{!compact && (
				<div className="flex items-center justify-between px-1 text-[10px] text-muted-foreground">
					<div className="flex items-center gap-1">
						{hasFailedMutations ? (
							<div className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
								<CloudOff className="h-3 w-3" />
								<span>{m.common_failed_count({ count: String(totalFailed) })}</span>
							</div>
						) : hasPendingMutations ? (
							<>
								<Loader2 className="h-3 w-3 animate-spin" />
								<span>{m.common_pending_count({ count: String(totalPending) })}</span>
							</>
						) : lastSyncFormatted ? (
							<span>{m.common_synced_at({ time: lastSyncFormatted })}</span>
						) : (
							<span>{m.common_no_sync_yet()}</span>
						)}
					</div>
					<span>{storageUsageFormatted}</span>
				</div>
			)}
		</div>
	);
}
