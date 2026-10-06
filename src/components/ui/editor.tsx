import type { JSONContent } from "@tiptap/core";
import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import { TableKit } from "@tiptap/extension-table";
import UniqueID from "@tiptap/extension-unique-id";
import { Placeholder } from "@tiptap/extensions";
import {
	EditorContent,
	type Editor as TipTapEditor,
	useEditor,
	useEditorState,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
	Bold,
	BookOpenText,
	ChevronDown,
	Columns3,
	Eraser,
	HelpCircle,
	Highlighter,
	ImageIcon,
	Italic,
	Link2,
	List,
	ListOrdered,
	Minus,
	Pilcrow,
	Plus,
	Redo,
	Rows3,
	Table2,
	Trash2,
	Underline,
	Undo,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { uuidv7 } from "uuidv7";
import { Quiz } from "@/components/editor/extensions/quiz-extension";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Toggle } from "@/components/ui/toggle";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";

export interface EditorProps {
	/** Compact Tiptap JSON is the only persisted source of truth. */
	value: JSONContent | null | undefined;
	onChange: (json: JSONContent) => void;
	className?: string;
	placeholder?: string;
	editable?: boolean;
}

const EMPTY_DOCUMENT: JSONContent = {
	type: "doc",
	content: [{ type: "paragraph" }],
};

export const createEditorExtensions = (
	editable: boolean,
	placeholder?: string,
) => [
	StarterKit.configure({
		heading: { levels: [1, 2] },
		link: {
			autolink: false,
			linkOnPaste: false,
			openOnClick: !editable,
		},
	}),
	Highlight.configure({ multicolor: false }),
	TableKit.configure({
		table: {
			resizable: false,
			renderWrapper: true,
			HTMLAttributes: { class: "lesson-table" },
		},
	}),
	Placeholder.configure({
		placeholder: placeholder ?? "Start writing the lesson…",
		includeChildren: true,
		showOnlyCurrent: true,
	}),
	Quiz,
	UniqueID.configure({
		types: ["quiz"],
		generateID: () => uuidv7(),
		updateDocument: editable,
	}),
	Image.configure({ allowBase64: true }),
];

interface LessonSectionPreset {
	heading: string;
	body: JSONContent;
}

function emptyList(type: "bulletList" | "orderedList"): JSONContent {
	return {
		type,
		content: [
			{
				type: "listItem",
				content: [{ type: "paragraph" }],
			},
		],
	};
}

function lessonSectionPresets(): LessonSectionPreset[] {
	return [
		{
			heading: m.editor_section_objective(),
			body: emptyList("bulletList"),
		},
		{
			heading: m.editor_section_explanation(),
			body: { type: "paragraph" },
		},
		{
			heading: m.editor_section_example(),
			body: emptyList("orderedList"),
		},
		{
			heading: m.editor_section_activity(),
			body: emptyList("orderedList"),
		},
		{
			heading: m.editor_section_key_points(),
			body: emptyList("bulletList"),
		},
	];
}

function insertLessonSection(
	editor: TipTapEditor,
	{ heading, body }: LessonSectionPreset,
) {
	editor
		.chain()
		.focus()
		.insertContent([
			{
				type: "heading",
				attrs: { level: 2 },
				content: [{ type: "text", text: heading }],
			},
			body,
		])
		.run();
}

function normalizeLinkAddress(value: string) {
	const trimmed = value.trim();
	if (!trimmed) return null;
	const address = /^[a-z][a-z\d+.-]*:/iu.test(trimmed)
		? trimmed
		: `https://${trimmed}`;
	try {
		const url = new URL(address);
		return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
	} catch {
		return null;
	}
}

async function compactImageDataUrl(file: File) {
	const objectUrl = URL.createObjectURL(file);
	try {
		const image = await new Promise<HTMLImageElement>((resolve, reject) => {
			const element = new window.Image();
			element.onload = () => resolve(element);
			element.onerror = reject;
			element.src = objectUrl;
		});
		const scale = Math.min(1, 1200 / Math.max(image.width, image.height));
		const canvas = document.createElement("canvas");
		canvas.width = Math.max(1, Math.round(image.width * scale));
		canvas.height = Math.max(1, Math.round(image.height * scale));
		const context = canvas.getContext("2d");
		if (!context) return null;
		context.drawImage(image, 0, 0, canvas.width, canvas.height);
		return canvas.toDataURL("image/webp", 0.78);
	} finally {
		URL.revokeObjectURL(objectUrl);
	}
}

function TableContextToolbar({ editor }: { editor: TipTapEditor }) {
	const isInTable = useEditorState({
		editor,
		selector: ({ editor: currentEditor }) => currentEditor.isActive("table"),
	});

	if (!isInTable) return null;

	const controls = [
		{
			label: m.editor_table_add_row_above(),
			icon: Rows3,
			run: () => editor.chain().focus().addRowBefore().run(),
		},
		{
			label: m.editor_table_add_row_below(),
			icon: Plus,
			run: () => editor.chain().focus().addRowAfter().run(),
		},
		{
			label: m.editor_table_add_column_before(),
			icon: Columns3,
			run: () => editor.chain().focus().addColumnBefore().run(),
		},
		{
			label: m.editor_table_add_column_after(),
			icon: Plus,
			run: () => editor.chain().focus().addColumnAfter().run(),
		},
		{
			label: m.editor_table_header_row(),
			icon: Bold,
			run: () => editor.chain().focus().toggleHeaderRow().run(),
		},
	];

	return (
		<div className="flex flex-wrap items-center gap-1 border-t bg-primary/5 px-2 py-1.5">
			<Table2 className="mr-1 size-4 text-primary" />
			{controls.map(({ label, icon: Icon, run }) => (
				<Button
					key={label}
					type="button"
					variant="ghost"
					size="xs"
					onClick={run}
					className="gap-1"
				>
					<Icon className="size-3.5" />
					<span className="hidden sm:inline">{label}</span>
				</Button>
			))}
			<div className="mx-1 h-5 w-px bg-border" />
			<Button
				type="button"
				variant="ghost"
				size="xs"
				onClick={() => editor.chain().focus().deleteRow().run()}
			>
				{m.editor_table_delete_row()}
			</Button>
			<Button
				type="button"
				variant="ghost"
				size="xs"
				onClick={() => editor.chain().focus().deleteColumn().run()}
			>
				{m.editor_table_delete_column()}
			</Button>
			<Button
				type="button"
				variant="ghost"
				size="xs"
				className="text-destructive hover:text-destructive"
				onClick={() => editor.chain().focus().deleteTable().run()}
			>
				<Trash2 className="mr-1 size-3.5" />
				{m.editor_table_delete()}
			</Button>
		</div>
	);
}

function EditorToolbar({ editor }: { editor: TipTapEditor }) {
	const imageInputRef = useRef<HTMLInputElement>(null);
	const [customTableOpen, setCustomTableOpen] = useState(false);
	const [customRows, setCustomRows] = useState(3);
	const [customColumns, setCustomColumns] = useState(2);
	const [linkOpen, setLinkOpen] = useState(false);
	const [linkAddress, setLinkAddress] = useState("");

	const insertTable = (rows: number, cols: number) => {
		editor
			.chain()
			.focus()
			.insertTable({ rows, cols, withHeaderRow: false })
			.run();
		setCustomTableOpen(false);
	};

	const insertImage = async (file?: File) => {
		if (!file) return;
		const src = await compactImageDataUrl(file);
		if (src) editor.chain().focus().setImage({ src, alt: file.name }).run();
	};

	const applyLink = () => {
		const href = normalizeLinkAddress(linkAddress);
		if (!href) return;
		editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
		setLinkOpen(false);
	};

	return (
		<div className="border-b bg-muted/20">
			<div className="flex flex-wrap items-center gap-1 p-1.5">
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button type="button" variant="ghost" size="sm" className="gap-1">
							<Pilcrow className="size-4" />
							<span className="hidden sm:inline">{m.editor_text_style()}</span>
							<ChevronDown className="size-3" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start">
						<DropdownMenuItem
							onSelect={() => editor.chain().focus().setParagraph().run()}
						>
							{m.editor_normal_text()}
						</DropdownMenuItem>
						<DropdownMenuItem
							onSelect={() =>
								editor.chain().focus().setHeading({ level: 1 }).run()
							}
						>
							{m.editor_heading()}
						</DropdownMenuItem>
						<DropdownMenuItem
							onSelect={() =>
								editor.chain().focus().setHeading({ level: 2 }).run()
							}
						>
							{m.editor_subheading()}
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>

				<div className="mx-1 h-6 w-px bg-border" />
				{[
					{
						name: "bold",
						label: m.editor_bold(),
						icon: Bold,
						run: () => editor.chain().focus().toggleBold().run(),
					},
					{
						name: "italic",
						label: m.editor_italic(),
						icon: Italic,
						run: () => editor.chain().focus().toggleItalic().run(),
					},
					{
						name: "underline",
						label: m.editor_underline(),
						icon: Underline,
						run: () => editor.chain().focus().toggleUnderline().run(),
					},
					{
						name: "highlight",
						label: m.editor_highlight(),
						icon: Highlighter,
						run: () => editor.chain().focus().toggleHighlight().run(),
					},
				].map(({ name, label, icon: Icon, run }) => (
					<Toggle
						key={name}
						type="button"
						size="sm"
						pressed={editor.isActive(name)}
						onPressedChange={run}
						aria-label={label}
						title={label}
					>
						<Icon className="size-4" />
					</Toggle>
				))}

				<div className="mx-1 h-6 w-px bg-border" />
				<Toggle
					type="button"
					size="sm"
					pressed={editor.isActive("bulletList")}
					onPressedChange={() =>
						editor.chain().focus().toggleBulletList().run()
					}
					aria-label={m.editor_bullet_list()}
					title={m.editor_bullet_list()}
				>
					<List className="size-4" />
				</Toggle>
				<Toggle
					type="button"
					size="sm"
					pressed={editor.isActive("orderedList")}
					onPressedChange={() =>
						editor.chain().focus().toggleOrderedList().run()
					}
					aria-label={m.editor_numbered_list()}
					title={m.editor_numbered_list()}
				>
					<ListOrdered className="size-4" />
				</Toggle>

				<Popover open={linkOpen} onOpenChange={setLinkOpen}>
					<PopoverTrigger asChild>
						<Toggle
							type="button"
							size="sm"
							pressed={editor.isActive("link")}
							onPressedChange={() =>
								setLinkAddress(editor.getAttributes("link").href ?? "")
							}
							aria-label={m.editor_link()}
							title={m.editor_link()}
						>
							<Link2 className="size-4" />
						</Toggle>
					</PopoverTrigger>
					<PopoverContent align="start" className="w-80 space-y-3">
						<label
							htmlFor="editor-link-address"
							className="space-y-1 text-sm font-medium"
						>
							<span>{m.editor_link_address()}</span>
							<Input
								id="editor-link-address"
								type="url"
								value={linkAddress}
								onChange={(event) => setLinkAddress(event.target.value)}
								placeholder="https://example.com"
							/>
						</label>
						<div className="flex justify-end gap-2">
							{editor.isActive("link") && (
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={() => {
										editor.chain().focus().unsetLink().run();
										setLinkOpen(false);
									}}
								>
									{m.editor_link_remove()}
								</Button>
							)}
							<Button
								type="button"
								size="sm"
								onClick={applyLink}
								disabled={!normalizeLinkAddress(linkAddress)}
							>
								{m.editor_link_apply()}
							</Button>
						</div>
					</PopoverContent>
				</Popover>

				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button type="button" variant="outline" size="sm" className="gap-1">
							<Plus className="size-4" />
							{m.editor_insert()}
							<ChevronDown className="size-3" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start">
						<DropdownMenuLabel>{m.editor_table()}</DropdownMenuLabel>
						<DropdownMenuItem onSelect={() => insertTable(2, 2)}>
							<Table2 />2 × 2
						</DropdownMenuItem>
						<DropdownMenuItem onSelect={() => insertTable(3, 2)}>
							<Table2 />2 × 3
						</DropdownMenuItem>
						<DropdownMenuItem onSelect={() => insertTable(3, 3)}>
							<Table2 />3 × 3
						</DropdownMenuItem>
						<DropdownMenuItem onSelect={() => insertTable(4, 4)}>
							<Table2 />4 × 4
						</DropdownMenuItem>
						<DropdownMenuItem onSelect={() => setCustomTableOpen(true)}>
							<Table2 />
							{m.editor_custom_table()}
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							onSelect={() => editor.chain().focus().setQuiz().run()}
						>
							<HelpCircle />
							{m.editor_quiz()}
						</DropdownMenuItem>
						<DropdownMenuItem onSelect={() => imageInputRef.current?.click()}>
							<ImageIcon />
							{m.editor_image()}
						</DropdownMenuItem>
						<DropdownMenuItem
							onSelect={() => editor.chain().focus().setHorizontalRule().run()}
						>
							<Minus />
							{m.editor_divider()}
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>

				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button type="button" variant="ghost" size="sm" className="gap-1">
							<BookOpenText className="size-4" />
							<span className="hidden md:inline">{m.editor_sections()}</span>
							<ChevronDown className="size-3" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start">
						{lessonSectionPresets().map((preset) => (
							<DropdownMenuItem
								key={preset.heading}
								onSelect={() => insertLessonSection(editor, preset)}
							>
								{preset.heading}
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>

				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					title={m.editor_clear_formatting()}
					aria-label={m.editor_clear_formatting()}
					onClick={() =>
						editor.chain().focus().unsetAllMarks().clearNodes().run()
					}
				>
					<Eraser className="size-4" />
				</Button>

				<div className="flex-1" />
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					onClick={() => editor.chain().focus().undo().run()}
					disabled={!editor.can().undo()}
					aria-label={m.editor_undo()}
					title={m.editor_undo()}
				>
					<Undo className="size-4" />
				</Button>
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					onClick={() => editor.chain().focus().redo().run()}
					disabled={!editor.can().redo()}
					aria-label={m.editor_redo()}
					title={m.editor_redo()}
				>
					<Redo className="size-4" />
				</Button>
				<input
					ref={imageInputRef}
					type="file"
					accept="image/*"
					className="hidden"
					onChange={(event) => {
						void insertImage(event.target.files?.[0]);
						event.currentTarget.value = "";
					}}
				/>
			</div>

			{customTableOpen && (
				<div className="flex flex-wrap items-end gap-2 border-t bg-background px-3 py-2">
					<label
						htmlFor="editor-table-rows"
						className="space-y-1 text-xs font-medium"
					>
						<span>{m.editor_rows()}</span>
						<Input
							id="editor-table-rows"
							type="number"
							min={1}
							max={20}
							value={customRows}
							onChange={(event) =>
								setCustomRows(
									Math.max(1, Math.min(20, Number(event.target.value) || 1)),
								)
							}
							className="w-20"
						/>
					</label>
					<label
						htmlFor="editor-table-columns"
						className="space-y-1 text-xs font-medium"
					>
						<span>{m.editor_columns()}</span>
						<Input
							id="editor-table-columns"
							type="number"
							min={1}
							max={6}
							value={customColumns}
							onChange={(event) =>
								setCustomColumns(
									Math.max(1, Math.min(6, Number(event.target.value) || 1)),
								)
							}
							className="w-20"
						/>
					</label>
					<Button
						type="button"
						size="sm"
						onClick={() => insertTable(customRows, customColumns)}
					>
						{m.editor_insert_table()}
					</Button>
					<Button
						type="button"
						size="sm"
						variant="ghost"
						onClick={() => setCustomTableOpen(false)}
					>
						×
					</Button>
				</div>
			)}
			<TableContextToolbar editor={editor} />
		</div>
	);
}

export function Editor({
	value,
	onChange,
	className,
	placeholder,
	editable = true,
}: EditorProps) {
	const editor = useEditor({
		immediatelyRender: false,
		extensions: createEditorExtensions(editable, placeholder),
		content: value ?? EMPTY_DOCUMENT,
		editable,
		onUpdate: ({ editor: currentEditor }) => {
			onChange(currentEditor.getJSON());
		},
		editorProps: {
			attributes: {
				class:
					"prose prose-sm sm:prose-base focus:outline-none min-h-[150px] min-w-0 w-full p-4 max-w-none dark:prose-invert",
			},
		},
	});

	useEffect(() => {
		if (!editor) return;
		const nextValue = value ?? EMPTY_DOCUMENT;
		if (JSON.stringify(editor.getJSON()) !== JSON.stringify(nextValue)) {
			editor.commands.setContent(nextValue);
		}
	}, [value, editor]);

	return (
		<div
			className={cn(
				"flex min-w-0 max-w-full flex-col overflow-hidden rounded-md border border-input bg-background",
				className,
			)}
		>
			{editable && editor && <EditorToolbar editor={editor} />}
			<EditorContent editor={editor} className="min-h-0 min-w-0 flex-1" />
		</div>
	);
}
