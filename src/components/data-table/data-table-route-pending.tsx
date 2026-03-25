interface DataTableRoutePendingProps {
	message?: string;
}

export function DataTableRoutePending({
	message = "Preparing content...",
}: DataTableRoutePendingProps) {
	return (
		<div className="space-y-4">
			<div className="space-y-2">
				<div className="h-8 w-48 animate-pulse rounded-md bg-muted" />
				<div className="h-4 w-72 animate-pulse rounded-md bg-muted" />
			</div>
			<div className="rounded-md border p-10">
				<div className="flex items-center justify-center gap-2 text-muted-foreground">
					<div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
					<span className="text-sm font-medium">{message}</span>
				</div>
			</div>
		</div>
	);
}
