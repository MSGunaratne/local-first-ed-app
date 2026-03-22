import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export function NotFound() {
	return (
		<div className="flex h-[50vh] flex-col items-center justify-center gap-4">
			<h1 className="text-4xl font-bold">404</h1>
			<p className="text-muted-foreground">This page could not be found.</p>
			<Button asChild>
				<Link to="/">Go to Dashboard</Link>
			</Button>
		</div>
	);
}
