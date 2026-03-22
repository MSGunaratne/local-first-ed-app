import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import AuthHeader from "#/components/AuthHeader";
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
import { signUp } from "#/features/auth/action";

export const Route = createFileRoute("/sign-up")({
	component: SignUpPage,
});

function SignUpPage() {
	const navigate = useNavigate();
	const [error, setError] = useState("");
	const [isLoading, setIsLoading] = useState(false);

	const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		setError("");
		setIsLoading(true);

		const formData = new FormData(e.currentTarget);
		const name = formData.get("name") as string;
		const email = formData.get("email") as string;
		const password = formData.get("password") as string;
		const confirmPassword = formData.get("confirmPassword") as string;

		if (password !== confirmPassword) {
			setError(m.auth_error_passwords_dont_match());
			setIsLoading(false);
			return;
		}

		if (password.length < 6) {
			setError(m.auth_error_password_too_short());
			setIsLoading(false);
			return;
		}

		try {
			// const result = await authQueries.mutation.signUp(
			// 	name,
			// 	email,
			// 	password,
			// });

			const result = await signUp({ name, email, password });

			if (result.error) {
				setError(result.error.message || m.auth_error_sign_up_failed());
				setIsLoading(false);
				return;
			}

			// Redirect to dashboard or returnTo after successful registration
			navigate({ to: "/sign-in" });
		} catch (err) {
			setError(err instanceof Error ? err.message : m.auth_error_default());
			setIsLoading(false);
		}
	};

	return (
		<div className="flex min-h-screen flex-col bg-gradient-to-br from-background to-muted">
			<AuthHeader />
			<div className="flex flex-1 items-center justify-center p-4">
				<Card className="w-full max-w-md">
					<CardHeader className="space-y-1">
						<CardTitle className="text-2xl font-bold">
							{m.auth_sign_up_title()}
						</CardTitle>
						<CardDescription>{m.auth_sign_up_description()}</CardDescription>
					</CardHeader>
					<form onSubmit={handleSubmit}>
						<CardContent className="space-y-4">
							{error && (
								<div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
									{error}
								</div>
							)}
							<div className="space-y-2">
								<Label htmlFor="name">{m.auth_full_name_label()}</Label>
								<Input
									id="name"
									name="name"
									type="text"
									placeholder={m.auth_full_name_placeholder()}
									required
									autoComplete="name"
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="email">{m.auth_email_label()}</Label>
								<Input
									id="email"
									name="email"
									type="email"
									placeholder={m.auth_email_placeholder()}
									required
									autoComplete="email"
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="password">{m.auth_password_label()}</Label>
								<Input
									id="password"
									name="password"
									type="password"
									placeholder={m.auth_password_placeholder()}
									required
									autoComplete="new-password"
									minLength={6}
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="confirmPassword">
									{m.auth_confirm_password_label()}
								</Label>
								<Input
									id="confirmPassword"
									name="confirmPassword"
									type="password"
									placeholder={m.auth_password_placeholder()}
									required
									autoComplete="new-password"
									minLength={6}
								/>
							</div>
						</CardContent>
						<CardFooter className="flex flex-col space-y-4 pt-6">
							<Button type="submit" className="w-full" disabled={isLoading}>
								{isLoading
									? m.auth_creating_account_button()
									: m.auth_create_account_button()}
							</Button>
							<p className="text-center text-sm text-muted-foreground">
								{m.auth_already_have_account()}{" "}
								<Link
									to="/sign-in"
									className="font-medium text-primary hover:underline"
								>
									{m.auth_sign_in_button()}
								</Link>
							</p>
						</CardFooter>
					</form>
				</Card>
			</div>
		</div>
	);
}
