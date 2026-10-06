import { createFileRoute, redirect } from "@tanstack/react-router";
import { UserCreateForm } from "@/features/users/components/user-form";

export const Route = createFileRoute("/_dashboard/users/create")({
	beforeLoad: ({ context }) => {
		if (
			context.session.user.role !== "admin" &&
			context.session.user.role !== "super-admin"
		) {
			throw redirect({ to: "/users" });
		}
	},
	component: CreateUserPage,
});

function CreateUserPage() {
	return <UserCreateForm />;
}
