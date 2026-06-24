import {
	and,
	asc,
	count,
	desc,
	eq,
	gte,
	isNotNull,
	isNull,
	lte,
	type SQLWrapper,
	sql,
} from "drizzle-orm";
import { NotFoundError } from "#/db/utils/errors";
import {
	requireAdminSession,
	requireTeacherOrAdminSession,
} from "#/lib/auth/access";
import { readServerSession } from "#/lib/auth/session";
import { db } from "@/db";
import { lessons } from "@/features/lessons/lessons.schema";
import { asRole, Role } from "@/types/user";
import type {
	AnalyticsBatchIngest,
	AnalyticsEventInsert,
	AnalyticsSessionInsert,
	LessonFeedbackInput,
	StudentProgressEventInput,
} from "./analytics.schema";
import {
	analyticsDailyAggregates,
	analyticsEvents,
	analyticsSessions,
	lessonFeedback,
	studentProgressDailyAggregates,
} from "./analytics.schema";

const RAW_RETENTION_DAYS = 30;

type QuizBlock = {
	id: string;
	question: string;
};

type QuizAttempt = {
	questionId: string;
	question: string;
	isCorrect: boolean;
	occurredAt: Date;
};

function asRecord(value: unknown): Record<string, unknown> | null {
	return typeof value === "object" && value !== null
		? (value as Record<string, unknown>)
		: null;
}

function getString(value: unknown) {
	return typeof value === "string" ? value : null;
}

function collectQuizBlocks(content: unknown): QuizBlock[] {
	const blocks: QuizBlock[] = [];

	function walk(node: unknown) {
		const record = asRecord(node);
		if (!record) return;

		if (record.type === "quiz") {
			const attrs = asRecord(record.attrs);
			const question = getString(attrs?.question)?.trim() || "Untitled quiz";
			const quizId = getString(attrs?.id) || question;
			blocks.push({ id: quizId, question });
		}

		const children = record.content;
		if (Array.isArray(children)) {
			for (const child of children) {
				walk(child);
			}
		}
	}

	walk(content);
	return blocks;
}

function parseQuizAttempt(
	payload: unknown,
	occurredAt: Date,
): QuizAttempt | null {
	const record = asRecord(payload);
	if (!record) return null;

	const interactionType =
		getString(record.interactionType) ?? getString(record.kind);
	if (interactionType !== "quiz_answer") return null;

	const isCorrect = record.isCorrect;
	if (typeof isCorrect !== "boolean") return null;

	const question = getString(record.question)?.trim() || "Untitled quiz";
	const questionId = getString(record.quizId) || question;

	return {
		questionId,
		question,
		isCorrect,
		occurredAt,
	};
}

function normalizeActorContext(
	session: Awaited<ReturnType<typeof readServerSession>>,
) {
	const role = asRole(session?.user.role, "admin");

	if (!session || !role) {
		return {
			actorType: "anonymous" as const,
			authState: "anonymous" as const,
			roleBucket: null,
			teacherId: null,
		};
	}

	if (role === Role.ADMIN || role === Role.SUPER_ADMIN) {
		return {
			actorType: "admin" as const,
			authState: "authenticated" as const,
			roleBucket: role,
			teacherId: null,
		};
	}

	if (role === Role.TEACHER) {
		return {
			actorType: "teacher" as const,
			authState: "authenticated" as const,
			roleBucket: role,
			teacherId: session.user.id,
		};
	}

	return {
		actorType: "anonymous" as const,
		authState: "anonymous" as const,
		roleBucket: null,
		teacherId: null,
	};
}

function withActorContextForSession(
	session: AnalyticsSessionInsert,
	context: ReturnType<typeof normalizeActorContext>,
): AnalyticsSessionInsert {
	return {
		...session,
		actorType: context.actorType,
		authState: context.authState,
		roleBucket: context.roleBucket,
		teacherId: context.teacherId,
	};
}

function withActorContextForEvent(
	event: AnalyticsEventInsert,
	context: ReturnType<typeof normalizeActorContext>,
): AnalyticsEventInsert {
	return {
		...event,
		actorType: context.actorType,
		authState: context.authState,
		teacherId: context.teacherId,
	};
}

async function pruneExpiredRawRows() {
	const cutoff = new Date(
		Date.now() - RAW_RETENTION_DAYS * 24 * 60 * 60 * 1000,
	);

	await db
		.delete(analyticsEvents)
		.where(lte(analyticsEvents.occurredAt, cutoff));
	await db
		.delete(analyticsSessions)
		.where(lte(analyticsSessions.startedAt, cutoff));
}

function formatDaySql(column: SQLWrapper) {
	return sql<string>`strftime('%Y-%m-%d', case when ${column} > 10000000000 then datetime(${column} / 1000, 'unixepoch') else datetime(${column}, 'unixepoch') end)`;
}

async function rollupDailyAnalytics(days: string[]) {
	if (days.length === 0) return;

	for (const day of days) {
		await db
			.delete(analyticsDailyAggregates)
			.where(eq(analyticsDailyAggregates.dayUtc, day));

		// Aggregate sessions
		const sessionsOfDay = await db
			.select({
				actorType: analyticsSessions.actorType,
				roleBucket: analyticsSessions.roleBucket,
				teacherId: analyticsSessions.teacherId,
				sessionCount: count(analyticsSessions.id),
				dauCount: sql<number>`count(distinct ${analyticsSessions.pseudonymousActorId})`,
				avgDuration: sql<number>`coalesce(avg(${analyticsSessions.durationSeconds}), 0)`,
				dropOffCount: sql<number>`sum(case when ${analyticsSessions.exitRoute} is not null then 1 else 0 end)`,
			})
			.from(analyticsSessions)
			.where(eq(formatDaySql(analyticsSessions.startedAt), day))
			.groupBy(
				analyticsSessions.actorType,
				analyticsSessions.roleBucket,
				analyticsSessions.teacherId,
			);

		// Aggregate page views
		const pageViewsOfDay = await db
			.select({
				actorType: analyticsEvents.actorType,
				roleBucket: analyticsSessions.roleBucket,
				teacherId: analyticsEvents.teacherId,
				classId: analyticsEvents.classId,
				pageViews: count(analyticsEvents.id),
			})
			.from(analyticsEvents)
			.leftJoin(
				analyticsSessions,
				eq(analyticsEvents.sessionId, analyticsSessions.id),
			)
			.where(
				and(
					eq(analyticsEvents.eventType, "page_view"),
					eq(formatDaySql(analyticsEvents.occurredAt), day),
				),
			)
			.groupBy(
				analyticsEvents.actorType,
				analyticsSessions.roleBucket,
				analyticsEvents.teacherId,
				analyticsEvents.classId,
			);

		const groupMap = new Map<
			string,
			{
				actorType: "anonymous" | "teacher" | "admin";
				roleBucket: Role.SUPER_ADMIN | Role.ADMIN | Role.TEACHER | null;
				teacherId: string | null;
				classId: string | null;
				sessionCount: number;
				dauCount: number;
				avgSessionDurationSec: number;
				pageViews: number;
				dropOffCount: number;
			}
		>();

		for (const s of sessionsOfDay) {
			const key = `${s.actorType}:${s.roleBucket || ""}:${s.teacherId || ""}:`;
			groupMap.set(key, {
				actorType: s.actorType,
				roleBucket:
					s.roleBucket &&
					(s.roleBucket === Role.SUPER_ADMIN ||
						s.roleBucket === Role.ADMIN ||
						s.roleBucket === Role.TEACHER)
						? (s.roleBucket as Role.SUPER_ADMIN | Role.ADMIN | Role.TEACHER)
						: null,
				teacherId: s.teacherId,
				classId: null,
				sessionCount: Number(s.sessionCount ?? 0),
				dauCount: Number(s.dauCount ?? 0),
				avgSessionDurationSec: Math.round(Number(s.avgDuration ?? 0)),
				pageViews: 0,
				dropOffCount: Number(s.dropOffCount ?? 0),
			});
		}

		for (const p of pageViewsOfDay) {
			const key = `${p.actorType}:${p.roleBucket || ""}:${p.teacherId || ""}:${p.classId || ""}`;
			const existing = groupMap.get(key);
			if (existing) {
				existing.pageViews = Number(p.pageViews ?? 0);
			} else {
				groupMap.set(key, {
					actorType: p.actorType,
					roleBucket:
						p.roleBucket &&
						(p.roleBucket === Role.SUPER_ADMIN ||
							p.roleBucket === Role.ADMIN ||
							p.roleBucket === Role.TEACHER)
							? (p.roleBucket as Role.SUPER_ADMIN | Role.ADMIN | Role.TEACHER)
							: null,
					teacherId: p.teacherId,
					classId: p.classId,
					sessionCount: 0,
					dauCount: 0,
					avgSessionDurationSec: 0,
					pageViews: Number(p.pageViews ?? 0),
					dropOffCount: 0,
				});
			}
		}

		const insertRows = Array.from(groupMap.values()).map((row) => ({
			dayUtc: day,
			actorType: row.actorType,
			roleBucket: row.roleBucket,
			teacherId: row.teacherId,
			classId: row.classId,
			sessionCount: row.sessionCount,
			dauCount: row.dauCount,
			avgSessionDurationSec: row.avgSessionDurationSec,
			pageViews: row.pageViews,
			dropOffCount: row.dropOffCount,
		}));

		if (insertRows.length > 0) {
			await db.insert(analyticsDailyAggregates).values(insertRows);
		}
	}
}

export async function ingestAnalyticsBatch(data: AnalyticsBatchIngest) {
	const session = await readServerSession().catch(() => null);
	const actorContext = normalizeActorContext(session);

	const sessions = data.sessions.map((item) =>
		withActorContextForSession(item, actorContext),
	);
	const events = data.events.map((item) =>
		withActorContextForEvent(item, actorContext),
	);

	if (sessions.length > 0) {
		await db
			.insert(analyticsSessions)
			.values(sessions)
			.onConflictDoUpdate({
				target: analyticsSessions.id,
				set: {
					endedAt: sql`excluded.ended_at`,
					exitRoute: sql`excluded.exit_route`,
					durationSeconds: sql`excluded.duration_seconds`,
					activeSeconds: sql`excluded.active_seconds`,
					idleSeconds: sql`excluded.idle_seconds`,
					lastHeartbeatAt: sql`excluded.last_heartbeat_at`,
				},
			});
	}

	if (events.length > 0) {
		await db
			.insert(analyticsEvents)
			.values(events)
			.onConflictDoNothing({ target: analyticsEvents.idempotencyKey });
	}

	const affectedDays = new Set<string>();
	for (const s of sessions) {
		const d = new Date(s.startedAt).toISOString().slice(0, 10);
		affectedDays.add(d);
	}
	for (const e of events) {
		const d = new Date(e.occurredAt).toISOString().slice(0, 10);
		affectedDays.add(d);
	}

	if (affectedDays.size > 0) {
		await rollupDailyAnalytics(Array.from(affectedDays)).catch((error) => {
			console.warn("[Analytics] Daily rollup failed", error);
		});
	}

	// Opportunistic retention cleanup keeps table size bounded without a dedicated cron.
	if (Math.random() < 0.02) {
		await pruneExpiredRawRows().catch((error) => {
			console.warn("[Analytics] Raw retention prune failed", error);
		});
	}

	return {
		acceptedSessions: sessions.length,
		acceptedEvents: events.length,
	};
}

export async function getAdminAnalyticsOverview(lookbackDays: number) {
	await requireAdminSession("Only admins can view analytics insights");

	const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
	const sinceStr = since.toISOString().slice(0, 10);
	const rawSince = new Date(
		Date.now() -
			Math.min(lookbackDays, RAW_RETENTION_DAYS) * 24 * 60 * 60 * 1000,
	);

	const [aggregateKpis] = await db
		.select({
			sessionCount: sql<number>`sum(${analyticsDailyAggregates.sessionCount})`,
			pageViews: sql<number>`sum(${analyticsDailyAggregates.pageViews})`,
			avgSessionDuration: sql<number>`coalesce(sum(${analyticsDailyAggregates.avgSessionDurationSec} * ${analyticsDailyAggregates.sessionCount}) / sum(${analyticsDailyAggregates.sessionCount}), 0)`,
		})
		.from(analyticsDailyAggregates)
		.where(gte(analyticsDailyAggregates.dayUtc, sinceStr));

	const [dauKpi] = await db
		.select({
			dau: sql<number>`count(distinct ${analyticsSessions.pseudonymousActorId})`,
		})
		.from(analyticsSessions)
		.where(gte(analyticsSessions.startedAt, since));

	const viewsExpr = sql<number>`count(*)`;
	const topRoutes = await db
		.select({
			routeTemplate: analyticsEvents.routeTemplate,
			views: viewsExpr,
		})
		.from(analyticsEvents)
		.where(
			and(
				eq(analyticsEvents.eventType, "page_view"),
				gte(analyticsEvents.occurredAt, rawSince),
				isNotNull(analyticsEvents.routeTemplate),
			),
		)
		.groupBy(analyticsEvents.routeTemplate)
		.orderBy(desc(viewsExpr))
		.limit(8);

	const exitsExpr = sql<number>`count(*)`;
	const dropOffRoutes = await db
		.select({
			routeTemplate: analyticsSessions.exitRoute,
			exits: exitsExpr,
		})
		.from(analyticsSessions)
		.where(
			and(
				gte(analyticsSessions.startedAt, rawSince),
				isNotNull(analyticsSessions.exitRoute),
			),
		)
		.groupBy(analyticsSessions.exitRoute)
		.orderBy(desc(exitsExpr))
		.limit(8);

	const teacherSessionsExpr = sql<number>`count(*)`;
	const teacherInsights = await db
		.select({
			teacherId: analyticsSessions.teacherId,
			sessions: teacherSessionsExpr,
			avgDuration: sql<number>`coalesce(avg(${analyticsSessions.durationSeconds}), 0)`,
		})
		.from(analyticsSessions)
		.where(
			and(
				gte(analyticsSessions.startedAt, rawSince),
				isNotNull(analyticsSessions.teacherId),
			),
		)
		.groupBy(analyticsSessions.teacherId)
		.orderBy(desc(teacherSessionsExpr))
		.limit(8);

	const sessions = Number(aggregateKpis?.sessionCount ?? 0);
	const pageViews = Number(aggregateKpis?.pageViews ?? 0);

	const [feedbackKpi] = await db
		.select({
			feedbackCount: count(),
			avgRating: sql<number>`coalesce(avg(${lessonFeedback.rating}), 0)`,
		})
		.from(lessonFeedback)
		.where(gte(lessonFeedback.createdAt, since));

	const [progressKpi] = await db
		.select({
			startedCount: sql<number>`coalesce(sum(${studentProgressDailyAggregates.startedCount}), 0)`,
			completedCount: sql<number>`coalesce(sum(${studentProgressDailyAggregates.completedCount}), 0)`,
		})
		.from(studentProgressDailyAggregates)
		.where(gte(studentProgressDailyAggregates.dayUtc, sinceStr));

	const avgRatingExpr = sql<number>`coalesce(avg(${lessonFeedback.rating}), 0)`;
	const ratingCountExpr = count();

	const topRatedLessons = await db
		.select({
			lessonId: lessonFeedback.lessonId,
			lessonTitle: lessons.title,
			subject: lessons.subject,
			gradeLevel: lessons.gradeLevel,
			avgRating: avgRatingExpr,
			ratingCount: ratingCountExpr,
		})
		.from(lessonFeedback)
		.leftJoin(lessons, eq(lessonFeedback.lessonId, lessons.id))
		.where(gte(lessonFeedback.createdAt, since))
		.groupBy(
			lessonFeedback.lessonId,
			lessons.title,
			lessons.subject,
			lessons.gradeLevel,
		)
		.orderBy(desc(avgRatingExpr), desc(ratingCountExpr))
		.limit(6);

	const lowRatedLessons = await db
		.select({
			lessonId: lessonFeedback.lessonId,
			lessonTitle: lessons.title,
			subject: lessons.subject,
			gradeLevel: lessons.gradeLevel,
			avgRating: avgRatingExpr,
			ratingCount: ratingCountExpr,
		})
		.from(lessonFeedback)
		.leftJoin(lessons, eq(lessonFeedback.lessonId, lessons.id))
		.where(gte(lessonFeedback.createdAt, since))
		.groupBy(
			lessonFeedback.lessonId,
			lessons.title,
			lessons.subject,
			lessons.gradeLevel,
		)
		.orderBy(asc(avgRatingExpr), desc(ratingCountExpr))
		.limit(6);

	const recentComments = await db
		.select({
			lessonId: lessonFeedback.lessonId,
			lessonTitle: lessons.title,
			subject: lessons.subject,
			gradeLevel: lessons.gradeLevel,
			rating: lessonFeedback.rating,
			comment: lessonFeedback.comment,
			createdAt: lessonFeedback.createdAt,
		})
		.from(lessonFeedback)
		.leftJoin(lessons, eq(lessonFeedback.lessonId, lessons.id))
		.where(
			and(
				gte(lessonFeedback.createdAt, since),
				sql`length(trim(coalesce(${lessonFeedback.comment}, ''))) > 0`,
			),
		)
		.orderBy(desc(lessonFeedback.createdAt))
		.limit(10);

	return {
		lookbackDays,
		kpis: {
			dau: Number(dauKpi?.dau ?? 0),
			sessions,
			avgSessionDurationSeconds: Math.round(
				Number(aggregateKpis?.avgSessionDuration ?? 0),
			),
			pageViews,
			pageViewsPerSession:
				sessions > 0 ? Number((pageViews / sessions).toFixed(2)) : 0,
			feedbackCount: Number(feedbackKpi?.feedbackCount ?? 0),
			avgLessonRating: Number(Number(feedbackKpi?.avgRating ?? 0).toFixed(2)),
			lessonStarts: Number(progressKpi?.startedCount ?? 0),
			lessonCompletions: Number(progressKpi?.completedCount ?? 0),
		},
		topRoutes: topRoutes.flatMap((row) =>
			typeof row.routeTemplate === "string" && row.routeTemplate
				? [
						{
							routeTemplate: row.routeTemplate,
							views: Number(row.views ?? 0),
						},
					]
				: [],
		),
		dropOffRoutes: dropOffRoutes.flatMap((row) =>
			typeof row.routeTemplate === "string" && row.routeTemplate
				? [
						{
							routeTemplate: row.routeTemplate,
							exits: Number(row.exits ?? 0),
						},
					]
				: [],
		),
		teacherInsights: teacherInsights.flatMap((row) =>
			typeof row.teacherId === "string" && row.teacherId
				? [
						{
							teacherId: row.teacherId,
							sessions: Number(row.sessions ?? 0),
							avgDurationSeconds: Math.round(Number(row.avgDuration ?? 0)),
						},
					]
				: [],
		),
		feedbackInsights: {
			topRatedLessons: topRatedLessons.map((item) => ({
				lessonId: item.lessonId,
				lessonTitle: item.lessonTitle ?? "Untitled lesson",
				subject: item.subject ?? null,
				gradeLevel: item.gradeLevel ?? null,
				avgRating: Number(Number(item.avgRating ?? 0).toFixed(2)),
				ratingCount: Number(item.ratingCount ?? 0),
			})),
			lowRatedLessons: lowRatedLessons.map((item) => ({
				lessonId: item.lessonId,
				lessonTitle: item.lessonTitle ?? "Untitled lesson",
				subject: item.subject ?? null,
				gradeLevel: item.gradeLevel ?? null,
				avgRating: Number(Number(item.avgRating ?? 0).toFixed(2)),
				ratingCount: Number(item.ratingCount ?? 0),
			})),
			recentComments: recentComments.flatMap((item) =>
				typeof item.comment === "string" && item.comment
					? [
							{
								lessonId: item.lessonId,
								lessonTitle: item.lessonTitle ?? "Untitled lesson",
								subject: item.subject ?? null,
								gradeLevel: item.gradeLevel ?? null,
								rating: item.rating,
								comment: item.comment,
								createdAt: item.createdAt,
							},
						]
					: [],
			),
		},
	};
}

export async function getLessonAnalyticsDetails(lessonId: string) {
	await requireTeacherOrAdminSession(
		"Only teachers and admins can view lesson analytics",
	);

	const rawSince = new Date(
		Date.now() - RAW_RETENTION_DAYS * 24 * 60 * 60 * 1000,
	);

	const selectedLesson = await db.query.lessons.findFirst({
		where: and(eq(lessons.id, lessonId), isNull(lessons.deletedAt)),
		with: {
			feedback: {
				columns: {
					rating: true,
					comment: true,
					createdAt: true,
					actorType: true,
				},
				orderBy: (feedback, { desc }) => [desc(feedback.createdAt)],
			},
			progressAggregates: {
				columns: {
					dayUtc: true,
					startedCount: true,
					completedCount: true,
				},
				orderBy: (progress, { desc }) => [desc(progress.dayUtc)],
			},
			analyticsEvents: {
				columns: {
					eventType: true,
					engagementSeconds: true,
					payloadJson: true,
					occurredAt: true,
				},
				where: (events, { gte }) => gte(events.occurredAt, rawSince),
				orderBy: (events, { desc }) => [desc(events.occurredAt)],
			},
		},
	});

	if (!selectedLesson) {
		throw new NotFoundError("Lesson", lessonId);
	}

	const quizBlocks = collectQuizBlocks(selectedLesson.contentJson);
	const {
		feedback: lessonFeedbackRows,
		progressAggregates: lessonProgressRows,
		analyticsEvents: lessonAnalyticsEvents,
		...lesson
	} = selectedLesson;

	const [feedbackKpi] = await db
		.select({
			feedbackCount: count(),
			avgRating: sql<number>`coalesce(avg(${lessonFeedback.rating}), 0)`,
		})
		.from(lessonFeedback)
		.where(eq(lessonFeedback.lessonId, lessonId));

	const ratingRows = await db
		.select({
			rating: lessonFeedback.rating,
			count: count(),
		})
		.from(lessonFeedback)
		.where(eq(lessonFeedback.lessonId, lessonId))
		.groupBy(lessonFeedback.rating)
		.orderBy(desc(lessonFeedback.rating));

	const recentComments = lessonFeedbackRows
		.filter(
			(item) =>
				typeof item.comment === "string" && item.comment.trim().length > 0,
		)
		.slice(0, 20);

	const [progressTotals] = await db
		.select({
			startedCount: sql<number>`coalesce(sum(${studentProgressDailyAggregates.startedCount}), 0)`,
			completedCount: sql<number>`coalesce(sum(${studentProgressDailyAggregates.completedCount}), 0)`,
		})
		.from(studentProgressDailyAggregates)
		.where(eq(studentProgressDailyAggregates.lessonId, lessonId));

	const progressByDay = lessonProgressRows.slice(0, 30);

	const [rawEngagement] = await db
		.select({
			pageViews: sql<number>`sum(case when ${analyticsEvents.eventType} = 'page_view' then 1 else 0 end)`,
			lessonStarts: sql<number>`sum(case when ${analyticsEvents.eventType} = 'lesson_started' then 1 else 0 end)`,
			lessonCompletions: sql<number>`sum(case when ${analyticsEvents.eventType} = 'lesson_completed' then 1 else 0 end)`,
			activeSeconds: sql<number>`coalesce(sum(${analyticsEvents.engagementSeconds}), 0)`,
		})
		.from(analyticsEvents)
		.where(
			and(
				eq(analyticsEvents.lessonId, lessonId),
				gte(analyticsEvents.occurredAt, rawSince),
			),
		);

	const rawQuizEvents = lessonAnalyticsEvents.filter(
		(event) => event.eventType === "interaction",
	);

	const quizAttempts = rawQuizEvents.flatMap((row) => {
		const parsed = parseQuizAttempt(row.payloadJson, row.occurredAt);
		return parsed ? [parsed] : [];
	});

	const questionMap = new Map<
		string,
		{
			questionId: string;
			question: string;
			attemptCount: number;
			correctAttemptCount: number;
			lastAnsweredAt: Date | null;
		}
	>();

	for (const block of quizBlocks) {
		questionMap.set(block.id, {
			questionId: block.id,
			question: block.question,
			attemptCount: 0,
			correctAttemptCount: 0,
			lastAnsweredAt: null,
		});
	}

	for (const attempt of quizAttempts) {
		const existing = questionMap.get(attempt.questionId) ??
			questionMap.get(attempt.question) ?? {
				questionId: attempt.questionId,
				question: attempt.question,
				attemptCount: 0,
				correctAttemptCount: 0,
				lastAnsweredAt: null,
			};

		existing.attemptCount += 1;
		if (attempt.isCorrect) {
			existing.correctAttemptCount += 1;
		}
		if (
			!existing.lastAnsweredAt ||
			attempt.occurredAt > existing.lastAnsweredAt
		) {
			existing.lastAnsweredAt = attempt.occurredAt;
		}

		questionMap.set(existing.questionId, existing);
	}

	const attemptCount = quizAttempts.length;
	const correctAttemptCount = quizAttempts.filter(
		(attempt) => attempt.isCorrect,
	).length;
	const startedCount = Number(progressTotals?.startedCount ?? 0);
	const completedCount = Number(progressTotals?.completedCount ?? 0);

	return {
		lesson,
		feedback: {
			count: Number(feedbackKpi?.feedbackCount ?? 0),
			avgRating: Number(Number(feedbackKpi?.avgRating ?? 0).toFixed(2)),
			ratingBreakdown: [5, 4, 3, 2, 1].map((rating) => ({
				rating,
				count: Number(
					ratingRows.find((row) => row.rating === rating)?.count ?? 0,
				),
			})),
			recentComments: recentComments.flatMap((item) =>
				typeof item.comment === "string" && item.comment
					? [
							{
								rating: item.rating,
								comment: item.comment,
								createdAt: item.createdAt,
								actorType: item.actorType,
							},
						]
					: [],
			),
		},
		progress: {
			startedCount,
			completedCount,
			completionRate:
				startedCount > 0
					? Number(((completedCount / startedCount) * 100).toFixed(1))
					: 0,
			byDay: progressByDay.map((row) => ({
				dayUtc: row.dayUtc,
				startedCount: row.startedCount,
				completedCount: row.completedCount,
			})),
		},
		engagement: {
			rawRetentionDays: RAW_RETENTION_DAYS,
			pageViews: Number(rawEngagement?.pageViews ?? 0),
			lessonStarts: Number(rawEngagement?.lessonStarts ?? 0),
			lessonCompletions: Number(rawEngagement?.lessonCompletions ?? 0),
			activeSeconds: Number(rawEngagement?.activeSeconds ?? 0),
		},
		quiz: {
			rawRetentionDays: RAW_RETENTION_DAYS,
			authoredQuestionCount: quizBlocks.length,
			attemptedQuestionCount: Array.from(questionMap.values()).filter(
				(question) => question.attemptCount > 0,
			).length,
			attemptCount,
			correctAttemptCount,
			accuracy:
				attemptCount > 0
					? Number(((correctAttemptCount / attemptCount) * 100).toFixed(1))
					: 0,
			questions: Array.from(questionMap.values()).map((question) => ({
				...question,
				accuracy:
					question.attemptCount > 0
						? Number(
								(
									(question.correctAttemptCount / question.attemptCount) *
									100
								).toFixed(1),
							)
						: 0,
			})),
			recentAttempts: quizAttempts.slice(0, 10),
		},
	};
}

export async function submitLessonFeedback(input: LessonFeedbackInput) {
	const session = await readServerSession().catch(() => null);
	const actorContext = normalizeActorContext(session);

	await db
		.insert(lessonFeedback)
		.values({
			...input,
			actorType: actorContext.actorType,
			authState: actorContext.authState,
			roleBucket: actorContext.roleBucket,
			teacherId: actorContext.teacherId,
		})
		.onConflictDoNothing({ target: lessonFeedback.idempotencyKey });

	return {
		success: true,
	};
}

export async function submitStudentProgressEvent(
	input: StudentProgressEventInput,
) {
	const dayUtc = input.occurredAt.toISOString().slice(0, 10);
	const startedIncrement = input.status === "started" ? 1 : 0;
	const completedIncrement = input.status === "completed" ? 1 : 0;

	await db
		.insert(studentProgressDailyAggregates)
		.values({
			dayUtc,
			lessonId: input.lessonId,
			startedCount: startedIncrement,
			completedCount: completedIncrement,
		})
		.onConflictDoUpdate({
			target: [
				studentProgressDailyAggregates.dayUtc,
				studentProgressDailyAggregates.lessonId,
			],
			set: {
				startedCount: sql`${studentProgressDailyAggregates.startedCount} + ${startedIncrement}`,
				completedCount: sql`${studentProgressDailyAggregates.completedCount} + ${completedIncrement}`,
				updatedAt: new Date(),
			},
		});

	return {
		success: true,
	};
}
