import { CloudOff, Loader2, Wifi, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverHeader,
	PopoverTitle,
	PopoverTrigger,
} from "@/components/ui/popover";
import { cycleConnectionMode, useConnectionMode } from "@/lib/connection-mode";
import type { SyncConflictRecord } from "@/lib/local-db";
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
	const [conflicts, setConflicts] = useState<SyncConflictRecord[]>([]);
	const {
		hasPendingMutations,
		hasFailedMutations,
		hasConflicts,
		totalPending,
		totalFailed,
		totalConflicts,
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

	const Icon = hasConflicts
		? CloudOff
		: hasFailedMutations
			? CloudOff
			: hasPendingMutations
				? Loader2
				: isOnline
					? Wifi
					: WifiOff;

	useEffect(() => {
		if (!hasConflicts || totalConflicts === 0) {
			setConflicts([]);
			return;
		}

		let active = true;
		void refreshConflicts().then((items) => {
			if (active) {
				setConflicts(items);
			}
		});

		return () => {
			active = false;
		};
	}, [hasConflicts, totalConflicts]);

	async function resolveStoredConflict(
		conflictId: string,
		resolution: "keep-local" | "accept-remote",
	) {
		const { resolveConflict, getUnresolvedConflicts } = await import(
			"@/lib/local-db"
		);
		await resolveConflict(conflictId, resolution);
		setConflicts(await getUnresolvedConflicts());
		if (resolution === "keep-local" && isOnline) {
			const { syncAll } = await import("@/lib/local-db");
			void syncAll();
		}
	}

	const statusButton = (
		<Button
			type="button"
			variant="outline"
			size={compact ? "icon" : "default"}
			className={cn(
				"border-dashed bg-background/80 hover:bg-accent/50",
				compact ? "h-9 w-9" : "w-full justify-between gap-3 px-3",
			)}
			onClick={hasConflicts ? undefined : cycleConnectionMode}
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
	);

	return (
		<div className={cn("flex flex-col gap-1", className)}>
			{hasConflicts ? (
				<Popover>
					<PopoverTrigger asChild>{statusButton}</PopoverTrigger>
					<PopoverContent align="end" className="w-80">
						<PopoverHeader>
							<PopoverTitle>Sync conflicts</PopoverTitle>
						</PopoverHeader>
						<div className="mt-3 max-h-80 space-y-3 overflow-y-auto">
							{conflicts.length === 0 ? (
								<p className="text-sm text-muted-foreground">
									Loading conflicts...
								</p>
							) : (
								conflicts.map((conflict) => (
									<div
										key={conflict.id}
										className="rounded-md border bg-muted/30 p-3"
									>
										<div className="flex items-start justify-between gap-3">
											<div className="min-w-0">
												<p className="truncate text-sm font-medium">
													{getConflictTitle(conflict)}
												</p>
												<p className="text-xs text-muted-foreground">
													{conflict.scope} · {conflict.conflictType}
												</p>
											</div>
										</div>
										<div className="mt-3 flex gap-2">
											<Button
												type="button"
												size="sm"
												variant="outline"
												className="h-8 flex-1"
												onClick={() =>
													void resolveStoredConflict(
														conflict.id,
														"accept-remote",
													)
												}
											>
												Accept remote
											</Button>
											<Button
												type="button"
												size="sm"
												className="h-8 flex-1"
												onClick={() =>
													void resolveStoredConflict(conflict.id, "keep-local")
												}
											>
												Keep local
											</Button>
										</div>
									</div>
								))
							)}
						</div>
					</PopoverContent>
				</Popover>
			) : (
				statusButton
			)}

			{!compact && (
				<div className="flex items-center justify-between px-1 text-[10px] text-muted-foreground">
					<div className="flex items-center gap-1">
						{hasConflicts ? (
							<div className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
								<CloudOff className="h-3 w-3" />
								<span>{totalConflicts} conflicts</span>
							</div>
						) : hasFailedMutations ? (
							<div className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
								<CloudOff className="h-3 w-3" />
								<span>
									{m.common_failed_count({ count: String(totalFailed) })}
								</span>
							</div>
						) : hasPendingMutations ? (
							<>
								<Loader2 className="h-3 w-3 animate-spin" />
								<span>
									{m.common_pending_count({ count: String(totalPending) })}
								</span>
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

async function refreshConflicts() {
	const { getUnresolvedConflicts } = await import("@/lib/local-db");
	return getUnresolvedConflicts();
}

function getConflictTitle(conflict: SyncConflictRecord) {
	const localTitle = conflict.localRecord.title ?? conflict.localRecord.name;
	const remoteTitle = conflict.remoteRecord.title ?? conflict.remoteRecord.name;
	const title = localTitle ?? remoteTitle ?? conflict.entityId;
	return String(title);
}
