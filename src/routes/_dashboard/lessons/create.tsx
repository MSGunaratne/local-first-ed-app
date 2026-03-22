import { createFileRoute } from "@tanstack/react-router";
import { LessonForm } from "@/features/lessons/components/lesson-form";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/_dashboard/lessons/create")({
	component: CreateLessonPage,
});

function CreateLessonPage() {
	return (
		<div className="space-y-6">
			<div>
				<h3 className="text-lg font-medium">{m.lessons_create_title()}</h3>
				<p className="text-sm text-muted-foreground">
					{m.lessons_create_description()}
				</p>
			</div>
			<LessonForm mode="create" />
		</div>
	);
}
