import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { m } from "@/paraglide/messages";

export function NotFound() {
	return (
		<div className="flex h-[50vh] flex-col items-center justify-center gap-4">
			<h1 className="text-4xl font-bold">{m.error_not_found_title()}</h1>
			<p className="text-muted-foreground">{m.error_not_found_desc()}</p>
			<Button asChild>
				<Link to="/">{m.error_go_to_dashboard()}</Link>
			</Button>
		</div>
	);
}
