import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { UserEditForm } from "@/features/users/components/user-form";
import { userQueries } from "@/features/users/users.queries";
import { ensureQueryDataAfterRestore } from "@/lib/query-client";

export const Route = createFileRoute("/_dashboard/users/$userId/edit")({
	loader: async ({ context: { queryClient }, params }) => {
		await ensureQueryDataAfterRestore(
			queryClient,
			userQueries.detail(params.userId),
		);
	},
	component: EditUserPage,
});

function EditUserPage() {
	const params = Route.useParams();
	const { data: user } = useSuspenseQuery(userQueries.detail(params.userId));

	return <UserEditForm initialValues={user} />;
}
