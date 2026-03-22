import { Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface DataTableToolbarProps {
	globalFilter: string;
	onGlobalFilterChange: (value: string | ((old: string) => string)) => void;
	placeholder?: string;
	debounceMs?: number;
}

export function DataTableToolbar({
	globalFilter,
	onGlobalFilterChange,
	placeholder = "Search...",
	debounceMs = 300,
}: DataTableToolbarProps) {
	// Local state for immediate input feedback
	const [value, setValue] = useState(globalFilter);

	// Sync local state when external value changes (e.g., URL navigation)
	useEffect(() => {
		setValue(globalFilter);
	}, [globalFilter]);

	// Debounce the URL update
	useEffect(() => {
		const timeout = setTimeout(() => {
			if (value !== globalFilter) {
				onGlobalFilterChange(value);
			}
		}, debounceMs);

		return () => clearTimeout(timeout);
	}, [value, globalFilter, onGlobalFilterChange, debounceMs]);

	const handleClear = () => {
		setValue("");
		onGlobalFilterChange("");
	};

	return (
		<div className="flex items-center gap-2 py-4">
			<div className="relative max-w-sm flex-1">
				<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
				<Input
					placeholder={placeholder}
					value={value}
					onChange={(e) => setValue(e.target.value)}
					className="pl-9 pr-9"
				/>
				{value && (
					<Button
						variant="ghost"
						size="icon"
						className="absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2"
						onClick={handleClear}
					>
						<X className="h-3 w-3" />
						<span className="sr-only">Clear search</span>
					</Button>
				)}
			</div>
		</div>
	);
}
