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
import type { QueuedMutation } from "@/lib/mutation-queue";
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
	const [operations, setOperations] = useState<QueuedMutation[]>([]);
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
	const operationCount = totalPending + totalConflicts + totalFailed;

	useEffect(() => {
		if (
			operationCount === 0 ||
			(!hasPendingMutations && !hasConflicts && !hasFailedMutations)
		) {
			setConflicts([]);
			setOperations([]);
			return;
		}

		let active = true;
		void refreshAttentionItems().then(
			({ conflicts: items, operations: queued }) => {
				if (active) {
					setConflicts(items);
					setOperations(queued);
				}
			},
		);

		return () => {
			active = false;
		};
	}, [hasConflicts, hasFailedMutations, hasPendingMutations, operationCount]);

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
			const { syncAllSafely } = await import("@/lib/local-db");
			void syncAllSafely();
		}
	}

	async function resolveQueuedOperation(
		operation: QueuedMutation,
		action: "retry" | "discard",
	) {
		const queue = await import("@/lib/mutation-queue");
		if (
			action === "discard" &&
			!window.confirm(
				"Discard this local change and restore the server version?",
			)
		) {
			return;
		}
		if (action === "retry") await queue.retryMutation(operation.id);
		else await queue.discardMutation(operation.id);
		const refreshed = await refreshAttentionItems();
		setConflicts(refreshed.conflicts);
		setOperations(refreshed.operations);
		if (isOnline) {
			const { syncAllSafely } = await import("@/lib/local-db");
			void syncAllSafely();
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
	);

	return (
		<div className={cn("flex flex-col gap-1", className)}>
			<div className="flex items-center gap-1">
				{statusButton}
				{operationCount > 0 && (
					<Popover>
						<PopoverTrigger asChild>
							<Button
								type="button"
								variant="outline"
								size="icon"
								className="h-9 min-w-9 shrink-0 border-dashed bg-background/80 px-1"
								title="View local changes"
								aria-label={`View ${operationCount} local changes`}
							>
								<span className="text-xs font-semibold">{operationCount}</span>
							</Button>
						</PopoverTrigger>
					<PopoverContent align="end" className="w-80">
						<PopoverHeader>
							<PopoverTitle>Local change status</PopoverTitle>
						</PopoverHeader>
						<div className="mt-3 max-h-80 space-y-3 overflow-y-auto">
							{conflicts.length === 0 && operations.length === 0 ? (
								<p className="text-sm text-muted-foreground">
									Loading local changes...
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
												<p className="mt-1 text-xs text-muted-foreground">
													Changed:{" "}
													{getChangedFields(conflict).join(", ") ||
														"record state"}
												</p>
												{(conflict.localUpdatedAt ||
													conflict.remoteUpdatedAt) && (
													<p className="mt-1 text-[11px] text-muted-foreground">
														Local{" "}
														{conflict.localUpdatedAt?.toLocaleString() ??
															"unknown"}{" "}
														· Server{" "}
														{conflict.remoteUpdatedAt?.toLocaleString() ??
															"unknown"}
													</p>
												)}
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
							{operations.map((operation) => (
								<div
									key={operation.id}
									className="rounded-md border bg-muted/30 p-3"
								>
									<p className="text-sm font-medium">
										{getOperationStatusLabel(operation)}
									</p>
									<p className="mt-1 text-xs text-muted-foreground">
										{operation.scope} · {operation.type}
										{operation.lastError ? ` · ${operation.lastError}` : ""}
									</p>
									{(operation.status === "blocked" ||
										operation.status === "conflict" ||
										operation.status === "corrupt") && (
										<div className="mt-3 flex gap-2">
											<Button
												size="sm"
												variant="outline"
												className="h-8 flex-1"
												onClick={() =>
													void resolveQueuedOperation(operation, "discard")
												}
											>
												Discard local
											</Button>
											{operation.status !== "corrupt" && (
												<Button
													size="sm"
													className="h-8 flex-1"
													onClick={() =>
														void resolveQueuedOperation(operation, "retry")
													}
												>
													{operation.status === "conflict"
														? "Keep local"
														: "Retry"}
												</Button>
											)}
										</div>
									)}
								</div>
							))}
						</div>
					</PopoverContent>
					</Popover>
				)}
			</div>

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

async function refreshAttentionItems() {
	const { getUnresolvedConflicts } = await import("@/lib/local-db");
	const { getAll } = await import("@/lib/mutation-queue");
	const [conflicts, all] = await Promise.all([
		getUnresolvedConflicts(),
		getAll(),
	]);
	return {
		conflicts,
		operations: all,
	};
}

function getOperationStatusLabel(operation: QueuedMutation) {
	if (operation.status === "pending") return "Saved locally · queued";
	if (operation.status === "inFlight") return "Syncing with the server";
	if (operation.status === "conflict")
		return "Server and local versions differ";
	if (operation.status === "corrupt") return "Local change cannot be read";
	if (operation.errorKind === "authentication") return "Sign in again to sync";
	return "Blocked until you review this change";
}

function getConflictTitle(conflict: SyncConflictRecord) {
	const localTitle = conflict.localRecord.title ?? conflict.localRecord.name;
	const remoteTitle = conflict.remoteRecord.title ?? conflict.remoteRecord.name;
	const title = localTitle ?? remoteTitle ?? conflict.entityId;
	return String(title);
}

function getChangedFields(conflict: SyncConflictRecord) {
	const ignored = new Set([
		"sync_status",
		"syncStatus",
		"base_revision",
		"baseRevision",
		"serverRevision",
		"updated_at",
		"updatedAt",
	]);
	return Array.from(
		new Set([
			...Object.keys(conflict.localRecord),
			...Object.keys(conflict.remoteRecord),
		]),
	)
		.filter(
			(key) =>
				!ignored.has(key) &&
				JSON.stringify(conflict.localRecord[key]) !==
					JSON.stringify(conflict.remoteRecord[key]),
		)
		.slice(0, 5);
}
