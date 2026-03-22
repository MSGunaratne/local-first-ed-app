import { Link } from "@tanstack/react-router";
import {
	Book,
	Calculator,
	CheckCircle2,
	CircleDashed,
	Clock,
	Monitor,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { useLocalProgress } from "@/hooks/use-local-progress";
import { SUBJECT_METADATA, Subject } from "@/types/lesson";
import type { Lesson } from "../lessons.schema";

interface StudentLessonCardProps {
	lesson: Lesson;
}

const SubjectIcons = {
	[Subject.MATH]: Calculator,
	[Subject.ENGLISH]: Book,
	[Subject.ICT]: Monitor,
};

export function StudentLessonCard({ lesson }: StudentLessonCardProps) {
	const SubjectIcon = SubjectIcons[lesson.subject] || Book;

	const subjectMeta = SUBJECT_METADATA[lesson.subject];

	const getBadgeVariant = (color: string) => {
		switch (color) {
			case "info":
				return "default"; // Math
			case "success":
				return "secondary"; // English
			case "warning":
				return "destructive"; // ICT - just using destructive as a placeholder for a 'highlighted' color
			default:
				return "outline";
		}
	};

	return (
		<Card className="group flex flex-col overflow-hidden border-transparent bg-card/50 hover:bg-card hover:border-border transition-all duration-300 hover:shadow-lg">
			<CardHeader className="relative pb-2">
				<div className="flex justify-between items-start mb-2">
					<Badge
						variant={getBadgeVariant(subjectMeta.color)}
						className="capitalize shadow-sm"
					>
						{subjectMeta.label}
					</Badge>
					<div className="p-2 rounded-full bg-secondary/50 text-secondary-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors">
						<SubjectIcon className="h-5 w-5" />
					</div>
				</div>
				<CardTitle className="line-clamp-2 text-xl group-hover:text-primary transition-colors">
					{lesson.title}
				</CardTitle>
				<div className="flex items-center gap-2 mt-2">
					<Badge variant="outline" className="text-xs font-normal">
						Grade {lesson.gradeLevel}
					</Badge>
				</div>
			</CardHeader>
			<CardContent className="flex-1 pb-3 px-6">
				<CardDescription className="line-clamp-2 text-sm leading-relaxed">
					{lesson.lessonSummary || "No summary available for this lesson."}
				</CardDescription>
			</CardContent>
			<CardFooter className="pt-0 pb-5 px-6">
				<div className="w-full flex items-center justify-between gap-4">
					<div className="flex items-center gap-3">
						<div className="flex items-center text-sm text-muted-foreground">
							<Clock className="mr-1.5 h-4 w-4 text-primary/60" />
							{lesson.estimatedDuration} mins
						</div>
						<LessonStatusBadge lessonId={lesson.id} />
					</div>
					<Button
						asChild
						variant="secondary"
						size="sm"
						className="group-hover:translate-x-1 transition-transform"
					>
						<Link
							to="/student/lessons/$lessonId"
							params={{ lessonId: lesson.id }}
						>
							Start
						</Link>
					</Button>
				</div>
			</CardFooter>
		</Card>
	);
}

function LessonStatusBadge({ lessonId }: { lessonId: string }) {
	const { getLessonStatus } = useLocalProgress();
	const status = getLessonStatus(lessonId);

	if (status === "completed") {
		return (
			<Badge
				variant="secondary"
				className="gap-1 bg-green-500/15 text-green-600 hover:bg-green-500/25 border-green-200"
			>
				<CheckCircle2 className="h-3 w-3" />
				Completed
			</Badge>
		);
	}

	if (status === "in-progress") {
		return (
			<Badge
				variant="secondary"
				className="gap-1 bg-blue-500/15 text-blue-600 hover:bg-blue-500/25 border-blue-200"
			>
				<CircleDashed className="h-3 w-3 animate-spin-slow" />
				In Progress
			</Badge>
		);
	}

	return null;
}
