import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { LessonForm } from "@/features/lessons/components/lesson-form";
import { lessonQueries } from "@/features/lessons/lessons.queries";
import { ensureQueryDataAfterRestore } from "@/lib/query-client";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/_dashboard/lessons/$lessonId/edit")({
	loader: async ({ context: { queryClient }, params }) => {
		await ensureQueryDataAfterRestore(
			queryClient,
			lessonQueries.detail(params.lessonId),
		);
	},
	component: EditLessonPage,
});

function EditLessonPage() {
	const params = Route.useParams();
	const { data: lesson } = useSuspenseQuery(
		lessonQueries.detail(params.lessonId),
	);

	return (
		<div className="space-y-6">
			<div>
				<h3 className="text-lg font-medium">{m.lessons_edit_title()}</h3>
				<p className="text-sm text-muted-foreground">
					{m.lessons_edit_description()}
				</p>
			</div>
			<LessonForm mode="edit" initialValues={lesson} />
		</div>
	);
}
