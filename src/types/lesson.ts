import type { LabelColor } from "./user";

export enum Subject {
	MATH = "math",
	ENGLISH = "english",
	ICT = "ict",
}

export const SUBJECT_METADATA = {
	[Subject.MATH]: {
		label: "Math",
		color: "info",
	},
	[Subject.ENGLISH]: {
		label: "English",
		color: "success",
	},
	[Subject.ICT]: {
		label: "ICT",
		color: "warning",
	},
} as const satisfies Record<Subject, { label: string; color: LabelColor }>;

export enum SyncStatus {
	PENDING = "pending",
	SYNCED = "synced",
	CONFLICT = "conflict",
}

export enum QuestionType {
	MCQ = "mcq",
	TEXT = "text",
}
