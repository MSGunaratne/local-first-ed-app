import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSyncStatus } from "@/lib/sync-status";

export function LocalFirstStatusBanner() {
	const { localDatabaseStatus, localDatabaseError, syncError } =
		useSyncStatus();
	const message =
		localDatabaseStatus === "error"
			? localDatabaseError || "Offline storage is unavailable."
			: syncError;

	if (!message) return null;

	return (
		<div
			role="alert"
			className="fixed inset-x-4 top-4 z-[100] mx-auto flex max-w-2xl items-center gap-3 rounded-lg border border-destructive/40 bg-background p-3 text-sm shadow-lg"
		>
			<AlertTriangle className="size-5 shrink-0 text-destructive" />
			<div className="min-w-0 flex-1">
				<p className="font-semibold">
					{localDatabaseStatus === "error"
						? "Offline mode could not start"
						: "Changes have not synchronized"}
				</p>
				<p className="truncate text-muted-foreground">{message}</p>
			</div>
			<Button
				type="button"
				variant="outline"
				size="sm"
				onClick={() => window.location.reload()}
			>
				<RefreshCw className="size-4" />
				Retry
			</Button>
		</div>
	);
}
