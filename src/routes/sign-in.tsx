import { useMutation } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useActionState } from "react";
import { z } from "zod";
import AuthHeader from "#/components/AuthHeader";
import { authMutations } from "#/features/auth/auth.queries";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/sign-in")({
	validateSearch: z.object({
		returnTo: z.string().optional(),
	}),
	component: SignInPage,
});

function SignInPage() {
	const { returnTo } = Route.useSearch();
	const navigate = useNavigate();
	const { mutateAsync } = useMutation(authMutations.signIn());
	const [state, formAction, isPending] = useActionState(
		async (_previous: { error: string }, formData: FormData) => {
			const email = formData.get("email") as string;
			const password = formData.get("password") as string;

			try {
				const { redirectTo } = await mutateAsync({
					email,
					password,
					returnTo,
				});

				navigate({ to: redirectTo, replace: true });
				return { error: "" };
			} catch (err) {
				return {
					error: err instanceof Error ? err.message : m.auth_error_default(),
				};
			}
		},
		{ error: "" },
	);

	return (
		<div className="flex min-h-screen flex-col bg-gradient-to-br from-background to-muted">
			<AuthHeader />
			<div className="flex flex-1 items-center justify-center p-4">
				<Card className="w-full max-w-lg border-2 shadow-lg">
					<CardHeader className="space-y-2 pb-8 text-center">
						<CardTitle className="text-2xl font-bold">
							{m.auth_sign_in_title()}
						</CardTitle>
						<CardDescription className="text-base">
							{m.auth_sign_in_description()}
						</CardDescription>
					</CardHeader>
					<form action={formAction}>
						<CardContent className="space-y-4">
							{state.error && (
								<div
									role="alert"
									className="rounded-md bg-destructive/10 p-3 text-base text-destructive font-medium border border-destructive/20"
								>
									{state.error}
								</div>
							)}
							<div className="space-y-2">
								<Label htmlFor="email" className="text-base font-semibold">
									{m.auth_email_label()}
								</Label>
								<Input
									id="email"
									name="email"
									type="email"
									placeholder={m.auth_email_placeholder()}
									required
									autoComplete="email"
									className="h-12 text-base px-4"
								/>
							</div>
							<div className="space-y-2">
								<div className="flex items-center justify-between">
									<Label htmlFor="password" className="text-base font-semibold">
										{m.auth_password_label()}
									</Label>
									<Link
										to="/sign-in"
										className="text-sm text-primary font-medium hover:underline"
									>
										{m.auth_forgot_password()}
									</Link>
								</div>
								<Input
									id="password"
									name="password"
									type="password"
									placeholder={m.auth_password_placeholder()}
									required
									autoComplete="current-password"
									minLength={6}
									className="h-12 text-base px-4"
								/>
							</div>
						</CardContent>
						<CardFooter className="flex flex-col space-y-4 pt-6">
							<Button
								type="submit"
								className="w-full h-14 text-lg font-bold"
								disabled={isPending}
							>
								{isPending
									? m.auth_signing_in_button()
									: m.auth_sign_in_button()}
							</Button>
							<p className="text-center text-base text-muted-foreground">
								{m.auth_no_account_text()}{" "}
								<Link
									to="/sign-up"
									className="font-bold text-primary hover:underline"
								>
									{m.auth_sign_up_link()}
								</Link>
							</p>
						</CardFooter>
					</form>
				</Card>
			</div>
		</div>
	);
}
