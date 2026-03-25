import { useStore } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import type { JSONContent } from "@tiptap/core";
import { BookOpen, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { generateHtmlFromJson } from "@/components/ui/editor";
import { lessonMutations } from "@/features/lessons/lessons.queries";
import {
	type LessonInsert,
	lessonInsertSchema,
} from "@/features/lessons/lessons.schema";
import { useAppForm } from "@/hooks/use-app-form";
import { m } from "@/paraglide/messages";
import { Subject } from "@/types/lesson";
import type { CurriculumItem } from "../lesson.types";
import type { LessonDetails } from "../lessons.service";
import { CurationPanel } from "./curation-panel";

interface LessonFormProps {
	mode: "create" | "edit";
	initialValues?: LessonDetails;
}

export function LessonForm({ mode, initialValues }: LessonFormProps) {
	const navigate = useNavigate();
	const createMutation = useMutation(lessonMutations.create());
	const updateMutation = useMutation(
		lessonMutations.update(initialValues?.id as string),
	);

	const defaultValues: LessonInsert = {
		title: "",
		subject: Subject.MATH,
		gradeLevel: 6,
		contentJson: null,
		contentHtml: "",
		linkedCurriculumIds: [],
		estimatedDuration: 0,
		teacherNotes: "",
		isPublished: false,
	};

	const form = useAppForm({
		defaultValues: initialValues ?? defaultValues,
		validators: {
			onChange: lessonInsertSchema,
		},
		onSubmit: async ({ value }) => {
			const contentHtml = value.contentJson
				? generateHtmlFromJson(value.contentJson)
				: null;

			const payload = {
				...value,
				contentHtml,
			};

			if (mode === "create") {
				await createMutation.mutateAsync(payload);
			} else {
				if (!initialValues?.id)
					throw new Error("Lesson ID is missing for update");

				await updateMutation.mutateAsync(payload);
			}
			navigate({ to: "/lessons" });
		},
	});

	const currentSubject = useStore(form.store, (s) => s.values.subject);
	const linkedCurriculumIds = useStore(
		form.store,
		(s) => s.values.linkedCurriculumIds ?? [],
	);

	const handleMatchSelect = (match: CurriculumItem, ocrText: string) => {
		form.setFieldValue("title", match.topic);
		form.setFieldValue("gradeLevel", match.grade);

		// Map subject string to Enum if possible
		const subjectEnum = Object.values(Subject).find(
			(s) => s.toLowerCase() === match.subject.toLowerCase(),
		);
		if (subjectEnum) {
			form.setFieldValue("subject", subjectEnum);
		}

		// Add to linked curriculum IDs
		const currentIds = form.getFieldValue("linkedCurriculumIds") ?? [];
		if (!currentIds.includes(match.id)) {
			form.setFieldValue("linkedCurriculumIds", [...currentIds, match.id]);
		}

		// Create initial content JSON with OCR text
		const newContent: JSONContent = {
			type: "doc",
			content: [
				{
					type: "heading",
					attrs: { level: 2 },
					content: [{ type: "text", text: match.topic }],
				},
				{
					type: "paragraph",
					content: [{ type: "text", text: ocrText }],
				},
			],
		};

		const currentContent = form.getFieldValue(
			"contentJson",
		) as JSONContent | null;
		if (currentContent?.content) {
			form.setFieldValue("contentJson", {
				type: "doc",
				content: [
					...(currentContent.content ?? []),
					...(newContent.content ?? []),
				],
			});
		} else {
			form.setFieldValue("contentJson", newContent);
		}
	};

	const handleRemoveCurriculumId = (id: string) => {
		const currentIds = form.getFieldValue("linkedCurriculumIds") ?? [];
		form.setFieldValue(
			"linkedCurriculumIds",
			currentIds.filter((currId) => currId !== id),
		);
	};

	return (
		<div className="space-y-4">
			<Breadcrumb className="px-1">
				<BreadcrumbList>
					<BreadcrumbItem>
						<BreadcrumbLink asChild>
							<Link to="/lessons">{m.lessons_breadcrumb()}</Link>
						</BreadcrumbLink>
					</BreadcrumbItem>
					<BreadcrumbSeparator />
					<BreadcrumbItem>
						<BreadcrumbPage>
							{mode === "create"
								? m.lessons_breadcrumb_new()
								: m.lessons_breadcrumb_edit()}
						</BreadcrumbPage>
					</BreadcrumbItem>
				</BreadcrumbList>
			</Breadcrumb>

			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
				{/* Media / Curation Section */}
				<div className="md:col-span-1 h-[600px]">
					{mode === "create" ? (
						<CurationPanel
							subject={currentSubject}
							onMatchSelect={handleMatchSelect}
						/>
					) : (
						<Card className="h-full">
							<CardHeader>
								<CardTitle className="text-lg">
									{m.lessons_card_media()}
								</CardTitle>
							</CardHeader>
							<CardContent>
								<div className="text-sm text-muted-foreground text-center py-8">
									{m.lessons_media_unavailable()}
								</div>
							</CardContent>
						</Card>
					)}
				</div>

				<div className="md:col-span-1 lg:col-span-2 space-y-4">
					<Card className="border-2 shadow-sm">
						<CardHeader className="border-b bg-muted/30">
							<CardTitle className="text-xl font-bold flex items-center gap-2">
								<BookOpen className="h-5 w-5 text-primary" />
								{m.lessons_card_details()}
							</CardTitle>
						</CardHeader>
						<CardContent>
							<form.AppForm>
								<form.UnsavedChangesWarning />
								<form
									onSubmit={(e) => {
										e.preventDefault();
										e.stopPropagation();
										form.handleSubmit();
									}}
									className="space-y-4"
								>
									<form.AppField name="title">
										{(field) => (
											<field.TextField
												label={m.lessons_form_title_label()}
												placeholder={m.lessons_form_title_placeholder()}
												required
											/>
										)}
									</form.AppField>

									<div className="grid grid-cols-2 gap-4">
										<form.AppField name="subject">
											{(field) => (
												<field.Select
													label={m.lessons_form_subject_label()}
													placeholder={m.lessons_form_subject_placeholder()}
													options={Object.values(Subject).map((subject) => ({
														label:
															subject.charAt(0).toUpperCase() +
															subject.slice(1),
														value: subject,
													}))}
													required
												/>
											)}
										</form.AppField>

										<form.AppField name="gradeLevel">
											{(field) => (
												<field.NumberField
													label={m.lessons_form_grade_label()}
													min={6}
													max={12}
													required
												/>
											)}
										</form.AppField>
									</div>

									<form.AppField name="estimatedDuration">
										{(field) => (
											<field.NumberField
												label={m.lessons_form_duration_label()}
												description={m.lessons_form_duration_description()}
												min={1}
												max={180}
											/>
										)}
									</form.AppField>

									{linkedCurriculumIds.length > 0 && (
										<div className="space-y-2">
											<span className="text-sm font-medium">
												{m.lessons_form_linked_curriculum()}
											</span>
											<div className="flex flex-wrap gap-2">
												{linkedCurriculumIds.map((id) => (
													<Badge
														key={id}
														variant="secondary"
														className="gap-1 pr-1"
													>
														{id}
														<button
															type="button"
															onClick={() => handleRemoveCurriculumId(id)}
															className="ml-1 rounded-full hover:bg-muted p-0.5"
															aria-label={`Remove ${id}`}
														>
															<X className="h-3 w-3" />
														</button>
													</Badge>
												))}
											</div>
										</div>
									)}

									<form.AppField name="contentJson">
										{(field) => (
											<field.Editor
												label={m.lessons_form_content_label()}
												placeholder={m.lessons_form_content_placeholder()}
											/>
										)}
									</form.AppField>

									<form.AppField name="teacherNotes">
										{(field) => (
											<field.TextArea
												label={m.lessons_form_notes_label()}
												placeholder={m.lessons_form_notes_placeholder()}
												rows={3}
											/>
										)}
									</form.AppField>

									<form.AppField name="isPublished">
										{(field) => (
											<field.Switch label={m.lessons_form_publish_label()} />
										)}
									</form.AppField>

									<div className="flex justify-between pt-4 border-t">
										<form.ResetButton />
										<form.SubmitButton
											className="h-12 px-8 text-base font-bold shadow-md"
											label={
												mode === "create"
													? m.lessons_form_submit_create()
													: m.lessons_form_submit_update()
											}
										/>
									</div>
								</form>
							</form.AppForm>
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	);
}
