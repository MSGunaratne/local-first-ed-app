import { useMutation } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
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

export const Route = createFileRoute("/sign-up")({
	component: SignUpPage,
});

function SignUpPage() {
	const navigate = useNavigate();
	const { mutateAsync, isPending } = useMutation(authMutations.signUp());
	const [error, setError] = useState("");

	const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		setError("");

		const formData = new FormData(e.currentTarget);
		const name = formData.get("name") as string;
		const email = formData.get("email") as string;
		const password = formData.get("password") as string;
		const confirmPassword = formData.get("confirmPassword") as string;

		if (password !== confirmPassword) {
			setError(m.auth_error_passwords_dont_match());
			return;
		}

		if (password.length < 6) {
			setError(m.auth_error_password_too_short());
			return;
		}

		try {
			const { redirectTo } = await mutateAsync({
				name,
				email,
				password,
			});

			navigate({ to: redirectTo });
		} catch (err) {
			setError(err instanceof Error ? err.message : m.auth_error_default());
		}
	};

	return (
		<div className="flex min-h-screen flex-col bg-gradient-to-br from-background to-muted">
			<AuthHeader />
			<div className="flex flex-1 items-center justify-center p-4">
				<Card className="w-full max-w-lg border-2 shadow-lg">
					<CardHeader className="space-y-2 pb-8 text-center">
						<CardTitle className="text-2xl font-bold">
							{m.auth_sign_up_title()}
						</CardTitle>
						<CardDescription className="text-base">
							{m.auth_sign_up_description()}
						</CardDescription>
					</CardHeader>
					<form onSubmit={handleSubmit}>
						<CardContent className="space-y-4">
							{error && (
								<div className="rounded-md bg-destructive/10 p-3 text-base text-destructive font-medium border border-destructive/20">
									{error}
								</div>
							)}
							<div className="space-y-2">
								<Label htmlFor="name" className="text-base font-semibold">
									{m.auth_full_name_label()}
								</Label>
								<Input
									id="name"
									name="name"
									type="text"
									placeholder={m.auth_full_name_placeholder()}
									required
									autoComplete="name"
									className="h-12 text-base px-4"
								/>
							</div>
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
								<Label htmlFor="password" className="text-base font-semibold">
									{m.auth_password_label()}
								</Label>
								<Input
									id="password"
									name="password"
									type="password"
									placeholder={m.auth_password_placeholder()}
									required
									autoComplete="new-password"
									minLength={6}
									className="h-12 text-base px-4"
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="confirmPassword" className="text-base font-semibold">
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
									className="h-12 text-base px-4"
								/>
							</div>
						</CardContent>
						<CardFooter className="flex flex-col space-y-4 pt-6">
							<Button type="submit" className="w-full h-14 text-lg font-bold" disabled={isPending}>
								{isPending
									? m.auth_creating_account_button()
									: m.auth_create_account_button()}
							</Button>
							<p className="text-center text-base text-muted-foreground">
								{m.auth_already_have_account()}{" "}
								<Link
									to="/sign-in"
									className="font-bold text-primary hover:underline"
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
