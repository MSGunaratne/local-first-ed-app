import { generateUniqueIds, UniqueID } from "@tiptap/extension-unique-id";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vitest";
import { Quiz } from "./quiz-extension";

describe("quiz document schema", () => {
	it("assigns a stable ID and preserves compact short-answer attributes", () => {
		const result = generateUniqueIds(
			{
				type: "doc",
				content: [
					{
						type: "quiz",
						attrs: {
							kind: "shortAnswer",
							question: "What does CPU mean?",
							acceptedAnswers: ["Central Processing Unit"],
						},
					},
				],
			},
			[
				StarterKit,
				Quiz,
				UniqueID.configure({
					types: ["quiz"],
					generateID: () => "quiz-stable-id",
				}),
			],
		);

		expect(result.content?.[0].attrs).toMatchObject({
			id: "quiz-stable-id",
			kind: "shortAnswer",
			options: ["", ""],
			acceptedAnswers: ["Central Processing Unit"],
		});
	});
});
