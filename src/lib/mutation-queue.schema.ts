import { z } from "zod";
import {
	lessonFeedbackInputSchema,
	studentProgressEventInputSchema,
} from "@/features/analytics/analytics.schema";
import {
	MUTATION_ERROR_KINDS,
	MUTATION_SCOPES,
	MUTATION_SERVER_FNS,
	MUTATION_STATUSES,
	MUTATION_TYPES,
	type MutationServerFnName,
} from "@/types/sync";

const mutationDataRecordSchema = z.record(z.string(), z.unknown());

const scopedCreatePayloadSchema = z
	.object({
		id: z.uuid(),
		idempotencyKey: z.string().optional(),
	})
	.catchall(z.unknown());

const scopedUpdatePayloadSchema = z.object({
	id: z.uuid(),
	data: mutationDataRecordSchema,
	expectedRevision: z.number().int().nonnegative().optional(),
	idempotencyKey: z.string().optional(),
});

const scopedDeletePayloadSchema = z.object({
	id: z.uuid(),
	expectedRevision: z.number().int().nonnegative().optional(),
	idempotencyKey: z.string().optional(),
});

const userUpdatePayloadSchema = z.object({
	id: z.uuid(),
	data: mutationDataRecordSchema,
	idempotencyKey: z.string().optional(),
});

export const mutationPayloadSchemas = {
	createLesson: scopedCreatePayloadSchema,
	updateLesson: scopedUpdatePayloadSchema,
	deleteLesson: scopedDeletePayloadSchema,
	restoreLesson: scopedUpdatePayloadSchema,
	createClass: scopedCreatePayloadSchema,
	updateClass: scopedUpdatePayloadSchema,
	deleteClass: scopedDeletePayloadSchema,
	restoreClass: scopedUpdatePayloadSchema,
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
	id: z.uuid(),
	scope: z.enum(MUTATION_SCOPES),
	type: z.enum(MUTATION_TYPES),
	serverFn: z.enum(MUTATION_SERVER_FNS),
	payload: z.unknown(),
	idempotencyKey: z.string().min(1),
	status: z.enum(MUTATION_STATUSES),
	entityId: z.string().nullable(),
	createdAt: z.number(),
	sequence: z.number(),
	retryCount: z.number(),
	nextAttemptAt: z.number(),
	leaseOwner: z.string().nullable(),
	leaseExpiresAt: z.number().nullable(),
	errorKind: z.enum(MUTATION_ERROR_KINDS).nullable(),
	lastError: z.string().optional(),
	remoteRecord: z.record(z.string(), z.unknown()).nullable(),
});

export type QueuedMutation = z.infer<typeof queuedMutationSchema>;

export const outboxRowSchema = z.object({
	id: z.uuid(),
	scope: z.enum(MUTATION_SCOPES),
	mutation_type: z.enum(MUTATION_TYPES),
	server_fn: z.enum(MUTATION_SERVER_FNS),
	payload_json: z.string(),
	idempotency_key: z.string().min(1),
	status: z.enum(MUTATION_STATUSES),
	entity_id: z.string().nullable(),
	created_at: z.number(),
	sequence: z.number(),
	retry_count: z.number(),
	next_attempt_at: z.number(),
	lease_owner: z.string().nullable(),
	lease_expires_at: z.number().nullable(),
	error_kind: z.enum(MUTATION_ERROR_KINDS).nullable(),
	last_error: z.string().nullable(),
	remote_record_json: z.string().nullable(),
});

export type OutboxRow = z.infer<typeof outboxRowSchema>;
