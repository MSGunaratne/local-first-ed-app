// Locale switcher refs:
// - Paraglide docs: https://inlang.com/m/gerre34r/library-inlang-paraglideJs
// - Router example: https://github.com/TanStack/router/tree/main/examples/react/i18n-paraglide#switching-locale

import { Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { getLocale, locales, setLocale } from "@/paraglide/runtime";

const labels = {
	en: "English",
	si: "සිංහල",
} as const;

export default function ParaglideLocaleSwitcher({
	isCollapsed = false,
	className,
}: {
	isCollapsed?: boolean;
	className?: string;
}) {
	const currentLocale = getLocale();

	if (isCollapsed) {
		return (
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="ghost"
						size="icon"
						className={cn("h-10 w-10", className)}
					>
						<Globe className="h-5 w-5" />
						<span className="sr-only">{m.common_switch_language()}</span>
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" side="right">
					{locales.map((locale) => (
						<DropdownMenuItem
							key={locale}
							onClick={() => setLocale(locale)}
							className={cn(locale === currentLocale && "bg-accent")}
						>
							{labels[locale] ?? locale.toUpperCase()}
						</DropdownMenuItem>
					))}
				</DropdownMenuContent>
			</DropdownMenu>
		);
	}

	return (
		<div
			className={cn(
				"flex flex-col gap-2 p-2 w-full border rounded-lg bg-muted/30",
				className,
			)}
		>
			<div className="flex items-center gap-2 px-1">
				<Globe className="h-4 w-4 text-muted-foreground" />
				<span className="text-sm font-semibold">
					{m.common_language_label()}
				</span>
			</div>
			<div className="flex gap-2">
				{locales.map((locale) => (
					<Button
						key={locale}
						variant={locale === currentLocale ? "default" : "outline"} // Stronger variant for active
						size="sm"
						className="flex-1 h-10 text-sm font-medium" // Increased height and font size
						onClick={() => setLocale(locale)}
					>
						{labels[locale]}
					</Button>
				))}
			</div>
		</div>
	);
}
