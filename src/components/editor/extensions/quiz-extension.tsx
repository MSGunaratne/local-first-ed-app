import { mergeAttributes, Node, ReactNodeViewRenderer } from "@tiptap/react";
import { QuizComponent } from "./quiz-component";

declare module "@tiptap/core" {
	interface Commands<ReturnType> {
		quiz: {
			setQuiz: () => ReturnType;
		};
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
			question: {
				default: "",
			},
			options: {
				default: ["Option 1", "Option 2"],
			},
			correctAnswer: {
				default: 0,
			},
		};
	},

	parseHTML() {
		return [
			{
				tag: "react-quiz",
				getAttrs: (node) => {
					if (typeof node === "string") return {};

					const options = node.getAttribute("options");
					return {
						question: node.getAttribute("question"),
						options: options ? JSON.parse(options) : [],
						correctAnswer: parseInt(
							node.getAttribute("correctAnswer") || "0",
							10,
						),
					};
				},
			},
		];
	},

	renderHTML({ HTMLAttributes }) {
		return ["react-quiz", mergeAttributes(HTMLAttributes)];
	},

	addNodeView() {
		return ReactNodeViewRenderer(QuizComponent);
	},

	addCommands() {
		return {
			setQuiz:
				() =>
				({ commands }) => {
					return commands.insertContent({
						type: this.name,
					});
				},
		};
	},
});
