import { useMutation } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useSelector } from "@tanstack/react-store";
import type { JSONContent } from "@tiptap/core";
import { BookOpen, X } from "lucide-react";
import { toast } from "sonner";
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
	const { mutateAsync: createMutation } = useMutation(lessonMutations.create());
	const { mutateAsync: updateMutation } = useMutation(
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
		isPublished: true,
	};

	const form = useAppForm({
		defaultValues: initialValues ?? defaultValues,
		validators: {
			onChange: lessonInsertSchema,
		},
		onSubmit: async ({ value }) => {
			const { generateHtmlFromJson } = await import("@/components/ui/editor");
			const contentHtml = value.contentJson
				? generateHtmlFromJson(value.contentJson)
				: null;

			const payload = {
				...value,
				contentHtml,
			};

			if (mode === "create") {
				await createMutation(payload);
			} else {
				if (!initialValues?.id)
					throw new Error("Lesson ID is missing for update");

				await updateMutation(payload);
			}
			navigate({ to: "/lessons" });
		},
	});

	const currentSubject = useSelector(form.store, (s) => s.values.subject);
	const currentGrade = useSelector(form.store, (s) => s.values.gradeLevel);
	const linkedCurriculumIds = useSelector(
		form.store,
		(s) => s.values.linkedCurriculumIds ?? [],
	);
	const isEditorEmpty = useSelector(form.store, (s) => {
		const content = s.values.contentJson;
		if (!content) return true;
		if (typeof content === "object") {
			if (
				content.type === "doc" &&
				(!content.content || content.content.length === 0)
			) {
				return true;
			}
		}
		return false;
	});

	const applyMetadata = (match: CurriculumItem) => {
		form.setFieldValue("title", match.topic);
		form.setFieldValue("gradeLevel", match.grade);

		const subjectEnum = Object.values(Subject).find(
			(s) => s.toLowerCase() === match.subject.toLowerCase(),
		);
		if (subjectEnum) {
			form.setFieldValue("subject", subjectEnum);
		}
	};

	const handleApplyMetadata = (match: CurriculumItem) => {
		applyMetadata(match);
		toast.success(m.curation_toast_applied_metadata());
	};

	const handleLinkToggle = (
		match: CurriculumItem,
		isAlreadyLinked: boolean,
	) => {
		const currentIds = form.getFieldValue("linkedCurriculumIds") ?? [];
		if (isAlreadyLinked) {
			form.setFieldValue(
				"linkedCurriculumIds",
				currentIds.filter((currId) => currId !== match.id),
			);
			toast.info(m.curation_toast_unlinked());
		} else {
			if (!currentIds.includes(match.id)) {
				form.setFieldValue("linkedCurriculumIds", [...currentIds, match.id]);
				toast.success(m.curation_toast_linked());
			}
		}
	};

	const handleInsertText = (
		ocrText: string,
		topic?: string,
		options?: { showToast?: boolean },
	) => {
		if (!ocrText.trim()) return;
		const showToast = options?.showToast ?? true;

		const newContent: JSONContent[] = [];

		if (topic) {
			newContent.push({
				type: "heading",
				attrs: { level: 2 },
				content: [{ type: "text", text: topic }],
			});
		}

		newContent.push({
			type: "paragraph",
			content: [{ type: "text", text: ocrText }],
		});

		const currentContent = form.getFieldValue(
			"contentJson",
		) as JSONContent | null;

		// Extract text content recursively from JSONContent
		const extractTextContent = (content: JSONContent | null): string => {
			if (!content) return "";
			let text = "";
			if (content.text) {
				text += content.text;
			}
			if (content.content) {
				for (const node of content.content) {
					text += " " + extractTextContent(node);
				}
			}
			return text;
		};

		const editorText = extractTextContent(currentContent);
		const cleanStr = (s: string) => s.replace(/\s+/g, "").toLowerCase();
		const cleanedOcr = cleanStr(ocrText);
		const cleanedEditor = cleanStr(editorText);
		const alreadyHasText = cleanedEditor.includes(cleanedOcr);

		if (alreadyHasText) {
			// If the editor has EXACTLY the OCR text (and nothing else, except maybe whitespace),
			// and they now want to insert it WITH a topic heading, we can replace the content
			// to include the heading!
			const isExactMatch = cleanedEditor === cleanedOcr;
			if (isExactMatch && topic) {
				form.setFieldValue("contentJson", {
					type: "doc",
					content: newContent,
				});
				if (showToast) {
					toast.success(m.curation_toast_inserted_content());
				}
			} else {
				// Already has the text, and has other edits or no topic, so don't double insert.
				if (topic && showToast) {
					toast.info(m.curation_toast_content_already_inserted());
				}
			}
			return;
		}

		if (currentContent?.content) {
			form.setFieldValue("contentJson", {
				type: "doc",
				content: [...(currentContent.content ?? []), ...newContent],
			});
		} else {
			form.setFieldValue("contentJson", {
				type: "doc",
				content: newContent,
			});
		}

		if (topic) {
			if (showToast) {
				toast.success(m.curation_toast_inserted_content());
			}
		} else {
			if (showToast) {
				toast.success(m.curation_toast_inserted_text());
			}
		}
	};

	const handleQuickApply = (match: CurriculumItem, ocrText: string) => {
		applyMetadata(match);

		const currentIds = form.getFieldValue("linkedCurriculumIds") ?? [];
		if (!currentIds.includes(match.id)) {
			form.setFieldValue("linkedCurriculumIds", [...currentIds, match.id]);
		}

		if (ocrText.trim()) {
			handleInsertText(ocrText, match.topic, { showToast: false });
		}

		toast.success(m.curation_toast_quick_applied());
	};

	const handleInsertImage = (dataUrl: string) => {
		if (!dataUrl) return;

		const newImageNode: JSONContent = {
			type: "image",
			attrs: {
				src: dataUrl,
			},
		};

		const currentContent = form.getFieldValue("contentJson");

		if (currentContent?.content) {
			form.setFieldValue("contentJson", {
				type: "doc",
				content: [...(currentContent.content ?? []), newImageNode],
			});
		} else {
			form.setFieldValue("contentJson", {
				type: "doc",
				content: [newImageNode],
			});
		}

		toast.success(m.curation_toast_inserted_image());
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
					<CurationPanel
						subject={currentSubject}
						grade={currentGrade}
						linkedIds={linkedCurriculumIds}
						onApplyMetadata={handleApplyMetadata}
						onQuickApply={handleQuickApply}
						onLinkToggle={handleLinkToggle}
						onInsertText={handleInsertText}
						onInsertImage={handleInsertImage}
						isEditorEmpty={isEditorEmpty}
					/>
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
