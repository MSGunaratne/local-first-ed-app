import {
	createFileRoute,
	useNavigate,
	useSearch,
} from "@tanstack/react-router";
import { StudentLessonListView } from "./student/index";
import { StudentShell } from "./student";
import { studentSearchSchema } from "@/features/lessons/student-search";

export const Route = createFileRoute("/")({
	validateSearch: (search) => studentSearchSchema.parse(search),
	component: HomePage,
});

function HomePage() {
	const search = useSearch({ from: Route.fullPath });
	const navigate = useNavigate({ from: Route.fullPath });

	return (
		<StudentShell>
			<StudentLessonListView
				search={search}
				onSearchChange={(updater) => {
					navigate({
						search:
							typeof updater === "function" ? (prev) => updater(prev) : updater,
					});
				}}
			/>
		</StudentShell>
	);
}
