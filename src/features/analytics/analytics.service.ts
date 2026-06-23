import {
	and,
	asc,
	count,
	desc,
	eq,
	gte,
	isNotNull,
	lte,
	sql,
} from "drizzle-orm";
import { requireAdminSession } from "#/lib/auth/access";
import { readServerSession } from "#/lib/auth/session";
import { db } from "@/db";
import { lessons } from "@/features/lessons/lessons.schema";
import { asRole, Role } from "@/types/user";
import type {
	AnalyticsBatchIngest,
	AnalyticsEventInsert,
	AnalyticsSessionInsert,
	LessonFeedbackInput,
} from "./analytics.schema";
import {
	analyticsEvents,
	analyticsSessions,
	lessonFeedback,
} from "./analytics.schema";

const RAW_RETENTION_DAYS = 30;

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
			.onConflictDoNothing({ target: analyticsSessions.id });
	}

	if (events.length > 0) {
		await db
			.insert(analyticsEvents)
			.values(events)
			.onConflictDoNothing({ target: analyticsEvents.idempotencyKey });
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

	const [sessionKpi] = await db
		.select({
			sessionCount: count(),
			dau: sql<number>`count(distinct ${analyticsSessions.pseudonymousActorId})`,
			avgSessionDuration: sql<number>`coalesce(avg(${analyticsSessions.durationSeconds}), 0)`,
		})
		.from(analyticsSessions)
		.where(gte(analyticsSessions.startedAt, since));

	const [pageViewKpi] = await db
		.select({ pageViews: count() })
		.from(analyticsEvents)
		.where(
			and(
				eq(analyticsEvents.eventType, "page_view"),
				gte(analyticsEvents.occurredAt, since),
			),
		);

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
				gte(analyticsEvents.occurredAt, since),
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
				gte(analyticsSessions.startedAt, since),
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
				gte(analyticsSessions.startedAt, since),
				isNotNull(analyticsSessions.teacherId),
			),
		)
		.groupBy(analyticsSessions.teacherId)
		.orderBy(desc(teacherSessionsExpr))
		.limit(8);

	const sessions = Number(sessionKpi?.sessionCount ?? 0);
	const pageViews = Number(pageViewKpi?.pageViews ?? 0);

	const [feedbackKpi] = await db
		.select({
			feedbackCount: count(),
			avgRating: sql<number>`coalesce(avg(${lessonFeedback.rating}), 0)`,
		})
		.from(lessonFeedback)
		.where(gte(lessonFeedback.createdAt, since));

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
			dau: Number(sessionKpi?.dau ?? 0),
			sessions,
			avgSessionDurationSeconds: Math.round(
				Number(sessionKpi?.avgSessionDuration ?? 0),
			),
			pageViews,
			pageViewsPerSession:
				sessions > 0 ? Number((pageViews / sessions).toFixed(2)) : 0,
			feedbackCount: Number(feedbackKpi?.feedbackCount ?? 0),
			avgLessonRating: Number(Number(feedbackKpi?.avgRating ?? 0).toFixed(2)),
		},
		topRoutes: topRoutes
			.filter(
				(row) => typeof row.routeTemplate === "string" && row.routeTemplate,
			)
			.map((row) => ({
				routeTemplate: row.routeTemplate as string,
				views: Number(row.views ?? 0),
			})),
		dropOffRoutes: dropOffRoutes
			.filter(
				(row) => typeof row.routeTemplate === "string" && row.routeTemplate,
			)
			.map((row) => ({
				routeTemplate: row.routeTemplate as string,
				exits: Number(row.exits ?? 0),
			})),
		teacherInsights: teacherInsights
			.filter((row) => typeof row.teacherId === "string" && row.teacherId)
			.map((row) => ({
				teacherId: row.teacherId as string,
				sessions: Number(row.sessions ?? 0),
				avgDurationSeconds: Math.round(Number(row.avgDuration ?? 0)),
			})),
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
			recentComments: recentComments
				.filter((item) => typeof item.comment === "string" && item.comment)
				.map((item) => ({
					lessonId: item.lessonId,
					lessonTitle: item.lessonTitle ?? "Untitled lesson",
					subject: item.subject ?? null,
					gradeLevel: item.gradeLevel ?? null,
					rating: item.rating,
					comment: item.comment as string,
					createdAt: item.createdAt,
				})),
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
