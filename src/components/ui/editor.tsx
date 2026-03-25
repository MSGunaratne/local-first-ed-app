import { generateHTML, type JSONContent } from "@tiptap/core";
import {
	EditorContent,
	type Editor as TipTapEditor,
	useEditor,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
	Bold,
	Heading1,
	Heading2,
	HelpCircle,
	Italic,
	List,
	ListOrdered,
	Quote,
	Redo,
	Undo,
} from "lucide-react";
import { useEffect } from "react";
import { Quiz } from "@/components/editor/extensions/quiz-extension";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { cn } from "@/lib/utils";

/**
 * Editor props - accepts JSONContent only (following TipTap best practices)
 * @see https://tiptap.dev/docs/guides/output-json-html
 */
export interface EditorProps {
	/** Content as TipTap JSONContent (source of truth) */
	value: JSONContent | null | undefined;
	/** Called on content change with both JSON and HTML */
	onChange: (json: JSONContent, html: string) => void;
	className?: string;
	placeholder?: string;
	editable?: boolean;
}

// Extensions configuration - keep in sync with generateHtmlFromJson
const EDITOR_EXTENSIONS = [StarterKit.configure({}), Quiz];

const EditorToolbar = ({ editor }: { editor: TipTapEditor | null }) => {
	if (!editor) return null;

	return (
		<div className="border border-input bg-transparent rounded-t-md p-1 flex flex-wrap gap-1 items-center">
			<Toggle
				size="sm"
				pressed={editor.isActive("bold")}
				onPressedChange={() => editor.chain().focus().toggleBold().run()}
				aria-label="Toggle bold"
			>
				<Bold className="h-4 w-4" />
			</Toggle>
			<Toggle
				size="sm"
				pressed={editor.isActive("italic")}
				onPressedChange={() => editor.chain().focus().toggleItalic().run()}
				aria-label="Toggle italic"
			>
				<Italic className="h-4 w-4" />
			</Toggle>

			<div className="w-px h-6 bg-border mx-1" />

			<Toggle
				size="sm"
				pressed={editor.isActive("heading", { level: 1 })}
				onPressedChange={() =>
					editor.chain().focus().toggleHeading({ level: 1 }).run()
				}
				aria-label="Toggle heading 1"
			>
				<Heading1 className="h-4 w-4" />
			</Toggle>
			<Toggle
				size="sm"
				pressed={editor.isActive("heading", { level: 2 })}
				onPressedChange={() =>
					editor.chain().focus().toggleHeading({ level: 2 }).run()
				}
				aria-label="Toggle heading 2"
			>
				<Heading2 className="h-4 w-4" />
			</Toggle>

			<div className="w-px h-6 bg-border mx-1" />

			<Toggle
				size="sm"
				pressed={editor.isActive("bulletList")}
				onPressedChange={() => editor.chain().focus().toggleBulletList().run()}
				aria-label="Toggle bullet list"
			>
				<List className="h-4 w-4" />
			</Toggle>
			<Toggle
				size="sm"
				pressed={editor.isActive("orderedList")}
				onPressedChange={() => editor.chain().focus().toggleOrderedList().run()}
				aria-label="Toggle ordered list"
			>
				<ListOrdered className="h-4 w-4" />
			</Toggle>

			<div className="w-px h-6 bg-border mx-1" />

			<Toggle
				size="sm"
				pressed={editor.isActive("blockquote")}
				onPressedChange={() => editor.chain().focus().toggleBlockquote().run()}
				aria-label="Toggle blockquote"
			>
				<Quote className="h-4 w-4" />
			</Toggle>

			<div className="w-px h-6 bg-border mx-1" />

			<Button
				type="button"
				variant="ghost"
				size="sm"
				onClick={() => editor.chain().focus().setQuiz().run()}
				className="gap-2 text-muted-foreground hover:text-foreground"
				title="Insert Quiz"
			>
				<HelpCircle className="h-4 w-4" />
				<span className="sr-only sm:not-sr-only sm:inline-block text-xs">
					Quiz
				</span>
			</Button>

			<div className="flex-1" />

			<Button
				type="button"
				variant="ghost"
				size="sm"
				onClick={() => editor.chain().focus().undo().run()}
				disabled={!editor.can().undo()}
			>
				<Undo className="h-4 w-4" />
			</Button>
			<Button
				type="button"
				variant="ghost"
				size="sm"
				onClick={() => editor.chain().focus().redo().run()}
				disabled={!editor.can().redo()}
			>
				<Redo className="h-4 w-4" />
			</Button>
		</div>
	);
};

/**
 * Rich text editor component using TipTap
 *
 * Following TipTap best practices:
 * - JSON is the source of truth for storage
 * - HTML is generated for display/rendering
 * - onChange returns both formats
 *
 * @see https://tiptap.dev/docs/guides/output-json-html
 */
export function Editor({
	value,
	onChange,
	className,
	editable = true,
}: EditorProps) {
	const editor = useEditor({
		immediatelyRender: false,
		extensions: EDITOR_EXTENSIONS,
		content: value ?? undefined,
		editable,
		onUpdate: ({ editor }) => {
			// Return both JSON (for storage) and HTML (for display)
			const json = editor.getJSON();
			const html = editor.getHTML();
			onChange(json, html);
		},
		editorProps: {
			attributes: {
				class:
					"prose prose-sm sm:prose-base focus:outline-none min-h-[150px] p-4 max-w-none dark:prose-invert",
			},
		},
	});

	// Handle external value changes (e.g., form reset, OCR paste)
	useEffect(() => {
		if (!editor || !value) return;

		// Compare JSON to avoid unnecessary updates
		const currentJson = editor.getJSON();
		if (JSON.stringify(currentJson) !== JSON.stringify(value)) {
			editor.commands.setContent(value);
		}
	}, [value, editor]);

	return (
		<div
			className={cn(
				"flex flex-col border border-input rounded-md overflow-hidden bg-background",
				className,
			)}
		>
			{editable && <EditorToolbar editor={editor} />}
			<EditorContent editor={editor} className="flex-1 min-h-0" />
		</div>
	);
}

/**
 * Generate HTML from JSONContent outside of editor context
 * Useful for server-side rendering or pre-generating HTML for offline display
 *
 * IMPORTANT: Extensions must match those used in the Editor
 */
export function generateHtmlFromJson(json: JSONContent): string {
	return generateHTML(json, EDITOR_EXTENSIONS);
}
