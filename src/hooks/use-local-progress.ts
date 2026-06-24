import { useCallback, useEffect, useState } from "react";
import { uuidv7 } from "uuidv7";

export type LessonStatus = "not-started" | "in-progress" | "completed";

interface ProgressData {
	status: LessonStatus;
	lastAccessed: number;
}

interface ProgressMap {
	[lessonId: string]: ProgressData;
}

type ProgressRow = {
	lesson_id: string;
	progress_status: "started" | "completed";
	occurred_at: number;
};

export function progressRowsToMap(rows: ProgressRow[]): ProgressMap {
	const progress: ProgressMap = {};
	for (const row of rows) {
		const current = progress[row.lesson_id];
		const status: LessonStatus =
			row.progress_status === "completed" ? "completed" : "in-progress";

		if (!current || status === "completed") {
			progress[row.lesson_id] = {
				status,
				lastAccessed: row.occurred_at * 1000,
			};
		}
	}

	return progress;
}

async function readProgressFromSQLite(): Promise<ProgressMap> {
	const { query } = await import("@/lib/local-db");
	const rows = await query<ProgressRow>(`
    SELECT lesson_id, progress_status, max(occurred_at) as occurred_at
    FROM student_progress_event
    GROUP BY lesson_id, progress_status;
  `);

	return progressRowsToMap(rows);
}

async function recordProgressEvent(
	lessonId: string,
	status: "started" | "completed",
) {
	const id = uuidv7();
	const idempotencyKey = id;
	const occurredAt = new Date();
	const occurredAtSeconds = Math.floor(occurredAt.getTime() / 1000);

	const { execute } = await import("@/lib/local-db");
	await execute(
		`INSERT OR IGNORE INTO student_progress_event
      (id, lesson_id, progress_status, idempotency_key, occurred_at, sync_status)
     VALUES (?, ?, ?, ?, ?, 'pending');`,
		[id, lessonId, status, idempotencyKey, occurredAtSeconds],
	);

	const { enqueueAndFlushIfOnline } = await import("@/lib/mutation-queue");
	await enqueueAndFlushIfOnline({
		scope: "analytics",
		type: "create",
		serverFn: "submitStudentProgressEvent",
		payload: {
			idempotencyKey,
			lessonId,
			status,
			occurredAt,
		},
		idempotencyKey,
	});
}

export function useLocalProgress() {
	const [progress, setProgress] = useState<ProgressMap>({});
	const [isLoaded, setIsLoaded] = useState(false);

	useEffect(() => {
		let active = true;
		readProgressFromSQLite()
			.then((value) => {
				if (active) {
					setProgress(value);
					setIsLoaded(true);
				}
			})
			.catch((error) => {
				console.error("Failed to load progress from local SQLite", error);
				if (active) {
					setIsLoaded(true);
				}
			});

		return () => {
			active = false;
		};
	}, []);

	const getLessonStatus = useCallback(
		(lessonId: string): LessonStatus => {
			return progress[lessonId]?.status || "not-started";
		},
		[progress],
	);

	const markAsStarted = useCallback(
		(lessonId: string) => {
			if (!isLoaded) return;

			setProgress((prev) => {
				const current = prev[lessonId];
				if (current?.status === "completed") return prev;
				if (current?.status === "in-progress") return prev;

				const newMap = {
					...prev,
					[lessonId]: {
						status: "in-progress" as const,
						lastAccessed: Date.now(),
					},
				};
				void recordProgressEvent(lessonId, "started");
				return newMap;
			});
		},
		[isLoaded],
	);

	const markAsCompleted = useCallback(
		(lessonId: string) => {
			if (!isLoaded) return;

			setProgress((prev) => {
				if (prev[lessonId]?.status === "completed") return prev;

				const newMap = {
					...prev,
					[lessonId]: {
						status: "completed" as const,
						lastAccessed: Date.now(),
					},
				};
				void recordProgressEvent(lessonId, "completed");
				return newMap;
			});
		},
		[isLoaded],
	);

	return {
		progress,
		isLoaded,
		getLessonStatus,
		markAsStarted,
		markAsCompleted,
	};
}
