import { type InferSelectModel, sql } from "drizzle-orm";
import {
	integer,
	primaryKey,
	sqliteTable,
	text,
} from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { uuidv7 } from "uuidv7";
import { z } from "zod";
import { studentProfiles } from "@/features/students/students.schema";
import { users } from "@/features/users/users.schema";
import { Subject } from "@/types/lesson";

export const classes = sqliteTable("class", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => uuidv7()),
	name: text("name").notNull(),
	subject: text("subject", {
		enum: [Subject.MATH, Subject.ENGLISH, Subject.ICT],
	}).notNull(),
	teacherId: text("teacher_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
	gradeLevel: integer("grade_level").notNull(),
	deletedAt: integer("deleted_at", { mode: "timestamp" }),
	createdAt: integer("created_at", { mode: "timestamp" })
		.notNull()
		.default(sql`(unixepoch())`),
	updatedAt: integer("updated_at", { mode: "timestamp" })
		.notNull()
		.default(sql`(unixepoch())`)
		.$onUpdate(() => new Date()),
});

export type Class = InferSelectModel<typeof classes>;

export const enrollments = sqliteTable(
	"enrollment",
	{
		classId: text("class_id")
			.notNull()
			.references(() => classes.id, { onDelete: "cascade" }),
		studentId: text("student_id")
			.notNull()
			.references(() => studentProfiles.id, { onDelete: "cascade" }),
		joinedAt: integer("joined_at", { mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
	},
	(t) => [primaryKey({ columns: [t.classId, t.studentId] })],
);

export type Enrollment = InferSelectModel<typeof enrollments>;

// export const classRelations = relations(classes, ({ one, many }) => ({
// 	teacher: one(users, {
// 		fields: [classes.teacherId],
// 		references: [users.id],
// 	}),
// 	enrollments: many(enrollments),
// }));

// export const enrollmentRelations = relations(enrollments, ({ one }) => ({
// 	class: one(classes, {
// 		fields: [enrollments.classId],
// 		references: [classes.id],
// 	}),
// 	student: one(studentProfiles, {
// 		fields: [enrollments.studentId],
// 		references: [studentProfiles.id],
// 	}),
// }));

export const classInsertSchema = createInsertSchema(classes, {
	gradeLevel: z.number().min(6).max(12),
}).omit({
	id: true,
	deletedAt: true,
	createdAt: true,
	updatedAt: true,
});

export type ClassInsert = z.infer<typeof classInsertSchema>;
