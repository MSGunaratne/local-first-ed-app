import { Link, useRouter } from "@tanstack/react-router";
import { AlertCircle, Home, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

export function AppError({ error }: { error: Error }) {
	const router = useRouter();

	return (
		<div className="flex h-screen w-full flex-col items-center justify-center bg-background p-4 animate-in fade-in duration-300">
			<Card className="w-full max-w-md border-destructive/20 shadow-lg">
				<CardHeader className="text-center pb-2">
					<div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
						<AlertCircle className="h-6 w-6 text-destructive" />
					</div>
					<CardTitle className="text-xl">Something went wrong</CardTitle>
				</CardHeader>
				<CardContent className="text-center text-muted-foreground space-y-2">
					<p>An unexpected error occurred while processing your request.</p>
					{process.env.NODE_ENV === "development" && (
						<div className="mt-4 rounded-md bg-muted p-2 text-left text-xs font-mono text-foreground overflow-auto max-h-32">
							{error.message}
						</div>
					)}
				</CardContent>
				<CardFooter className="flex flex-col gap-2 sm:flex-row justify-center pt-2">
					<Button
						variant="outline"
						onClick={() => window.history.back()}
						className="w-full sm:w-auto"
					>
						Go Back
					</Button>
					<Button
						onClick={() => {
							router.invalidate();
							window.location.reload();
						}}
						className="w-full sm:w-auto gap-2"
					>
						<RefreshCcw className="h-4 w-4" />
						Reload Page
					</Button>
				</CardFooter>
			</Card>
			<div className="mt-8 text-center">
				<Button variant="link" asChild className="text-muted-foreground">
					<Link to="/">
						<Home className="mr-2 h-4 w-4" />
						Return to Dashboard
					</Link>
				</Button>
			</div>
		</div>
	);
}
