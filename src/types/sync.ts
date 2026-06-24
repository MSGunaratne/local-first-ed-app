import { z } from "zod";
import {
	lessonFeedbackInputSchema,
	studentProgressEventInputSchema,
} from "@/features/analytics/analytics.schema";
import {
	MUTATION_SCOPES,
	MUTATION_SERVER_FNS,
	MUTATION_STATUSES,
	MUTATION_TYPES,
	MutationServerFnName,
} from "#/types/sync-constants";

export {
	MUTATION_SCOPES,
	MUTATION_SERVER_FNS,
	MUTATION_STATUSES,
	MUTATION_TYPES,
	SYNC_SCOPES,
} from "#/types/sync-constants";

const mutationDataRecordSchema = z.record(z.string(), z.unknown());

const scopedCreatePayloadSchema = z
	.object({
		id: z.string().min(1),
		idempotencyKey: z.string().optional(),
	})
	.catchall(z.unknown());

const scopedUpdatePayloadSchema = z.object({
	id: z.string().min(1),
	data: mutationDataRecordSchema,
	expectedUpdatedAt: z.string().optional(),
	idempotencyKey: z.string().optional(),
});

const scopedDeletePayloadSchema = z.object({
	id: z.string().min(1),
	idempotencyKey: z.string().optional(),
});

const userUpdatePayloadSchema = z.object({
	id: z.string().min(1),
	data: mutationDataRecordSchema,
	idempotencyKey: z.string().optional(),
});

export const mutationPayloadSchemas = {
	createLesson: scopedCreatePayloadSchema,
	updateLesson: scopedUpdatePayloadSchema,
	deleteLesson: scopedDeletePayloadSchema,
	createClass: scopedCreatePayloadSchema,
	updateClass: scopedUpdatePayloadSchema,
	deleteClass: scopedDeletePayloadSchema,
	createUser: mutationDataRecordSchema,
	updateUser: userUpdatePayloadSchema,
	deleteUser: scopedDeletePayloadSchema,
	submitLessonFeedback: lessonFeedbackInputSchema,
	submitStudentProgressEvent: studentProgressEventInputSchema,
} as const satisfies Record<MutationServerFnName, z.ZodType>;

export type MutationServerFnPayloadMap = {
	[K in MutationServerFnName]: z.infer<(typeof mutationPayloadSchemas)[K]>;
};

export const queuedMutationSchema = z.object({
	id: z.string().min(1),
	scope: z.enum(MUTATION_SCOPES),
	type: z.enum(MUTATION_TYPES),
	serverFn: z.enum(MUTATION_SERVER_FNS),
	payload: z.unknown(),
	idempotencyKey: z.string().min(1),
	status: z.enum(MUTATION_STATUSES),
	createdAt: z.number(),
	retryCount: z.number(),
	lastError: z.string().optional(),
});

export type QueuedMutation = z.infer<typeof queuedMutationSchema>;

export const outboxRowSchema = z.object({
	id: z.string().min(1),
	scope: z.enum(MUTATION_SCOPES),
	mutation_type: z.enum(MUTATION_TYPES),
	server_fn: z.enum(MUTATION_SERVER_FNS),
	payload_json: z.string(),
	idempotency_key: z.string().min(1),
	status: z.enum(MUTATION_STATUSES),
	created_at: z.number(),
	retry_count: z.number(),
	last_error: z.string().nullable(),
});

export type OutboxRow = z.infer<typeof outboxRowSchema>;
