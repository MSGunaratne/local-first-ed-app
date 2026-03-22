import { z } from "zod";
import { Subject } from "@/types/lesson";

export const studentSearchSchema = z.object({
	page: z.number().optional().catch(1),
	q: z.string().optional(),
	sort: z.enum(["newest", "oldest", "a-z", "z-a"]).optional().catch("newest"),
	subject: z.enum(Subject).optional(),
});

export const SORT_OPTIONS = [
	{ value: "newest", label: "Newest" },
	{ value: "oldest", label: "Oldest" },
	{ value: "a-z", label: "A-Z" },
	{ value: "z-a", label: "Z-A" },
] as const;

export const SORT_MAP = {
	newest: { id: "createdAt", desc: true },
	oldest: { id: "createdAt", desc: false },
	"a-z": { id: "title", desc: false },
	"z-a": { id: "title", desc: true },
} as const;
