import { useCallback, useEffect, useState } from "react";

export type LessonStatus = "not-started" | "in-progress" | "completed";

interface ProgressData {
	status: LessonStatus;
	lastAccessed: number;
}

interface ProgressMap {
	[lessonId: string]: ProgressData;
}

const STORAGE_KEY = "student-lesson-progress";

export function useLocalProgress() {
	const [progress, setProgress] = useState<ProgressMap>({});

	// Load from local storage on mount
	useEffect(() => {
		try {
			const stored = localStorage.getItem(STORAGE_KEY);
			if (stored) {
				setProgress(JSON.parse(stored));
			}
		} catch (e) {
			console.error("Failed to load progress from local storage", e);
		}
	}, []);

	const getLessonStatus = useCallback(
		(lessonId: string): LessonStatus => {
			return progress[lessonId]?.status || "not-started";
		},
		[progress],
	);

	const markAsStarted = useCallback((lessonId: string) => {
		setProgress((prev) => {
			const current = prev[lessonId];
			// Don't downgrade status if already completed
			if (current?.status === "completed") return prev;
			if (current?.status === "in-progress") return prev;

			const newMap = {
				...prev,
				[lessonId]: {
					status: "in-progress",
					lastAccessed: Date.now(),
				} as ProgressData,
			};
			localStorage.setItem(STORAGE_KEY, JSON.stringify(newMap));
			return newMap;
		});
	}, []);

	const markAsCompleted = useCallback((lessonId: string) => {
		setProgress((prev) => {
			const newMap = {
				...prev,
				[lessonId]: {
					status: "completed",
					lastAccessed: Date.now(),
				} as ProgressData,
			};
			localStorage.setItem(STORAGE_KEY, JSON.stringify(newMap));
			return newMap;
		});
	}, []);

	return {
		progress,
		getLessonStatus,
		markAsStarted,
		markAsCompleted,
	};
}
