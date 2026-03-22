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
						<Globe className="h-4 w-4" />
						<span className="sr-only">Switch Language</span>
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
			className={cn("flex items-center gap-2 px-2 py-1.5 w-full", className)}
		>
			<span className="text-xs text-muted-foreground font-medium shrink-0">
				{m.common_current_locale({ locale: currentLocale })}
			</span>
			<div className="flex gap-1 ml-auto">
				{locales.map((locale) => (
					<Button
						key={locale}
						variant={locale === currentLocale ? "secondary" : "ghost"}
						size="sm"
						className="h-6 px-2 text-xs"
						onClick={() => setLocale(locale)}
					>
						{locale.toUpperCase()}
					</Button>
				))}
			</div>
		</div>
	);
}
