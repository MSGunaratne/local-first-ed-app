import { relations } from "drizzle-orm";
import {
	analyticsDailyAggregates,
	analyticsEvents,
	analyticsSessions,
	lessonFeedback,
	studentProgressDailyAggregates,
} from "#/features/analytics/analytics.schema";
import { classes, enrollments } from "#/features/classes/classes.schema";
import { assessments, lessons } from "#/features/lessons/lessons.schema";
import { studentProfiles } from "#/features/students/students.schema";
import { accounts, sessions, users } from "#/features/users/users.schema";

// ---------------- users ----------------

export const userRelations = relations(users, ({ many, one }) => ({
	sessions: many(sessions),
	accounts: many(accounts),
	classes: many(classes),
	lessons: many(lessons),
	studentProfile: one(studentProfiles),
}));

export const sessionRelations = relations(sessions, ({ one }) => ({
	user: one(users, {
		fields: [sessions.userId],
		references: [users.id],
	}),
}));

export const accountRelations = relations(accounts, ({ one }) => ({
	user: one(users, {
		fields: [accounts.userId],
		references: [users.id],
	}),
}));

// ---------------- classes ----------------

export const classRelations = relations(classes, ({ one, many }) => ({
	teacher: one(users, {
		fields: [classes.teacherId],
		references: [users.id],
	}),
	enrollments: many(enrollments),
	analyticsEvents: many(analyticsEvents),
	dailyAggregates: many(analyticsDailyAggregates),
}));

export const enrollmentRelations = relations(enrollments, ({ one }) => ({
	class: one(classes, {
		fields: [enrollments.classId],
		references: [classes.id],
	}),
	student: one(studentProfiles, {
		fields: [enrollments.studentId],
		references: [studentProfiles.id],
	}),
}));

// ---------------- students ----------------

export const studentProfileRelations = relations(
	studentProfiles,
	({ one, many }) => ({
		user: one(users, {
			fields: [studentProfiles.userId],
			references: [users.id],
		}),
		enrollments: many(enrollments),
	}),
);

// ---------------- lessons ----------------

export const lessonRelations = relations(lessons, ({ many, one }) => ({
	teacher: one(users, {
		fields: [lessons.teacherId],
		references: [users.id],
	}),
	assessments: many(assessments),
	feedback: many(lessonFeedback),
	progressAggregates: many(studentProgressDailyAggregates),
	analyticsEvents: many(analyticsEvents),
}));

export const assessmentRelations = relations(assessments, ({ one }) => ({
	lesson: one(lessons, {
		fields: [assessments.lessonId],
		references: [lessons.id],
	}),
}));

// ---------------- analytics ----------------

export const analyticsSessionRelations = relations(
	analyticsSessions,
	({ many, one }) => ({
		events: many(analyticsEvents),
		teacher: one(users, {
			fields: [analyticsSessions.teacherId],
			references: [users.id],
		}),
	}),
);

export const analyticsEventRelations = relations(
	analyticsEvents,
	({ one }) => ({
		session: one(analyticsSessions, {
			fields: [analyticsEvents.sessionId],
			references: [analyticsSessions.id],
		}),
		lesson: one(lessons, {
			fields: [analyticsEvents.lessonId],
			references: [lessons.id],
		}),
		class: one(classes, {
			fields: [analyticsEvents.classId],
			references: [classes.id],
		}),
		teacher: one(users, {
			fields: [analyticsEvents.teacherId],
			references: [users.id],
		}),
	}),
);

export const analyticsDailyAggregateRelations = relations(
	analyticsDailyAggregates,
	({ one }) => ({
		teacher: one(users, {
			fields: [analyticsDailyAggregates.teacherId],
			references: [users.id],
		}),
		class: one(classes, {
			fields: [analyticsDailyAggregates.classId],
			references: [classes.id],
		}),
	}),
);

export const lessonFeedbackRelations = relations(lessonFeedback, ({ one }) => ({
	lesson: one(lessons, {
		fields: [lessonFeedback.lessonId],
		references: [lessons.id],
	}),
	teacher: one(users, {
		fields: [lessonFeedback.teacherId],
		references: [users.id],
	}),
}));

export const studentProgressDailyAggregateRelations = relations(
	studentProgressDailyAggregates,
	({ one }) => ({
		lesson: one(lessons, {
			fields: [studentProgressDailyAggregates.lessonId],
			references: [lessons.id],
		}),
	}),
);
