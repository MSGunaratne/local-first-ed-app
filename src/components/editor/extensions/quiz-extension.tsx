import { mergeAttributes, Node, ReactNodeViewRenderer } from "@tiptap/react";
import { QuizComponent } from "./quiz-component";

export type QuizKind = "mcq" | "shortAnswer";

export interface QuizAttributes {
	kind: QuizKind;
	question: string;
	options: string[];
	correctAnswer: number;
	acceptedAnswers: string[];
	explanation: string;
}

declare module "@tiptap/core" {
	interface Commands<ReturnType> {
		quiz: {
			setQuiz: (attributes?: Partial<QuizAttributes>) => ReturnType;
		};
	}
}

function parseJsonArray(value: string | null, fallback: string[]) {
	if (!value) return fallback;
	try {
		const parsed: unknown = JSON.parse(value);
		return Array.isArray(parsed) &&
			parsed.every((item) => typeof item === "string")
			? parsed
			: fallback;
	} catch {
		return fallback;
	}
}

export const Quiz = Node.create({
	name: "quiz",
	group: "block",
	atom: true,
	selectable: true,
	draggable: true,

	addAttributes() {
		return {
			kind: { default: "mcq" },
			question: { default: "" },
			options: { default: ["", ""] },
			correctAnswer: { default: 0 },
			acceptedAnswers: { default: [""] },
			explanation: { default: "" },
		};
	},

	parseHTML() {
		return [
			{
				tag: "react-quiz",
				getAttrs: (element) => {
					if (typeof element === "string") return {};
					return {
						kind:
							element.getAttribute("data-kind") === "shortAnswer"
								? "shortAnswer"
								: "mcq",
						question: element.getAttribute("data-question") ?? "",
						options: parseJsonArray(element.getAttribute("data-options"), [
							"",
							"",
						]),
						correctAnswer:
							Number.parseInt(
								element.getAttribute("data-correct-answer") ?? "0",
								10,
							) || 0,
						acceptedAnswers: parseJsonArray(
							element.getAttribute("data-accepted-answers"),
							[""],
						),
						explanation: element.getAttribute("data-explanation") ?? "",
					};
				},
			},
		];
	},

	renderHTML({ HTMLAttributes }) {
		const {
			id,
			kind,
			question,
			options,
			correctAnswer,
			acceptedAnswers,
			explanation,
		} = HTMLAttributes;
		return [
			"react-quiz",
			mergeAttributes({
				"data-id": id,
				"data-kind": kind,
				"data-question": question,
				"data-options": JSON.stringify(options),
				"data-correct-answer": correctAnswer,
				"data-accepted-answers": JSON.stringify(acceptedAnswers),
				"data-explanation": explanation,
			}),
		];
	},

	addNodeView() {
		return ReactNodeViewRenderer(QuizComponent);
	},

	addCommands() {
		return {
			setQuiz:
				(attributes = {}) =>
				({ commands }) =>
					commands.insertContent({ type: this.name, attrs: attributes }),
		};
	},
});
