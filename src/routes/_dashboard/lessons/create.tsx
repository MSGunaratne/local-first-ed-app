import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { m } from "@/paraglide/messages";

const LessonForm = lazy(() =>
	import("@/features/lessons/components/lesson-form").then((module) => ({
		default: module.LessonForm,
	})),
);

export const Route = createFileRoute("/_dashboard/lessons/create")({
	component: CreateLessonPage,
});

function FormSkeleton() {
	return (
		<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
			<div className="md:col-span-1 h-[600px]">
				<Skeleton className="h-full w-full rounded-xl" />
			</div>
			<div className="md:col-span-1 lg:col-span-2 space-y-4">
				<Skeleton className="h-[600px] w-full rounded-xl" />
			</div>
		</div>
	);
}

function CreateLessonPage() {
	return (
		<div className="space-y-6">
			<div>
				<h3 className="text-lg font-medium">{m.lessons_create_title()}</h3>
				<p className="text-sm text-muted-foreground">
					{m.lessons_create_description()}
				</p>
			</div>
			<Suspense fallback={<FormSkeleton />}>
				<LessonForm mode="create" />
			</Suspense>
		</div>
	);
}
