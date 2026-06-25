import {
	createFileRoute,
	useNavigate,
	useSearch,
} from "@tanstack/react-router";
import { StudentLessonListView } from "@/features/lessons/components/student-lesson-list-view";
import { studentSearchSchema } from "@/features/lessons/student-search";

export const Route = createFileRoute("/student/")({
	validateSearch: (search) => studentSearchSchema.parse(search),
	component: StudentDashboard,
});

function StudentDashboard() {
	const search = useSearch({ from: Route.fullPath });
	const navigate = useNavigate({ from: Route.fullPath });

	return (
		<StudentLessonListView
			search={search}
			onSearchChange={(updater) => {
				navigate({ search: updater });
			}}
		/>
	);
}
