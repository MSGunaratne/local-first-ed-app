import { createFileRoute } from "@tanstack/react-router";
import { UserCreateForm } from "@/features/users/components/user-form";

export const Route = createFileRoute("/_dashboard/users/create")({
	component: CreateUserPage,
});

function CreateUserPage() {
	return <UserCreateForm />;
}
