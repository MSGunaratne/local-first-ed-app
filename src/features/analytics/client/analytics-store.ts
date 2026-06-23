import { Store } from "@tanstack/react-store";
import { uuidv7 } from "uuidv7";
import type {
	AnalyticsEventInsert,
	AnalyticsSessionInsert,
} from "../analytics.schema";
import {
	detectBrowserFamily,
	detectDeviceClass,
	detectOsFamily,
} from "./browser-env";

type Interval = {
	start: number;
	end: number | null;
	type: "active" | "idle";
};

export interface AnalyticsState {
	sessionId: string | null;
	startedAtMs: number | null;
	lastActivityAtMs: number;
	entryRoute: string | null;
	currentRoute: string | null;

	actorId: string | null;
	actorType: "anonymous" | "teacher" | "admin";
	authState: "anonymous" | "authenticated";
	roleBucket: AnalyticsSessionInsert["roleBucket"] | null;
	teacherId: string | null;

	intervals: Interval[];
	eventsBuffer: AnalyticsEventInsert[];

	deviceClass: "mobile" | "tablet" | "desktop" | "unknown";
	osFamily: string;
	browserFamily: string;
}

export const analyticsStore = new Store<AnalyticsState>({
	sessionId: null,
	startedAtMs: null,
	lastActivityAtMs: Date.now(),
	entryRoute: null,
	currentRoute: null,

	actorId: null,
	actorType: "anonymous",
	authState: "anonymous",
	roleBucket: null,
	teacherId: null,

	intervals: [],
	eventsBuffer: [],

	deviceClass: "unknown",
	osFamily: "Unknown",
	browserFamily: "Unknown",
});

export function setActorContext(
	context: Pick<
		AnalyticsState,
		"actorType" | "authState" | "roleBucket" | "teacherId"
	>,
) {
	analyticsStore.setState((state) => ({
		...state,
		...context,
	}));
}

export function initSession(actorId: string, initialRoute: string) {
	const now = Date.now();
	analyticsStore.setState((state) => ({
		...state,
		sessionId: uuidv7(),
		actorId,
		startedAtMs: now,
		lastActivityAtMs: now,
		entryRoute: initialRoute,
		currentRoute: initialRoute,
		intervals: [{ start: now, end: null, type: "active" }],
		eventsBuffer: [],
		deviceClass: detectDeviceClass(),
		osFamily: detectOsFamily(),
		browserFamily: detectBrowserFamily(),
	}));
}

export function updateIntervalState(isHidden: boolean) {
	const state = analyticsStore.state;
	if (!state.sessionId || !state.startedAtMs) return;

	const now = Date.now();

	analyticsStore.setState((draft) => {
		const newIntervals = [...draft.intervals];

		if (isHidden) {
			const open = newIntervals.find((i) => i.end === null);
			if (open) {
				open.end = now;
			}
			return { ...draft, intervals: newIntervals };
		}

		const idleTime = now - draft.lastActivityAtMs;
		const targetType = idleTime > 60_000 ? "idle" : "active";

		const open = newIntervals.find((i) => i.end === null);
		if (open) {
			if (open.type !== targetType) {
				open.end = now;
				newIntervals.push({ start: now, end: null, type: targetType });
			}
		} else {
			newIntervals.push({ start: now, end: null, type: targetType });
		}

		return { ...draft, intervals: newIntervals };
	});
}

export function markActive() {
	const state = analyticsStore.state;
	if (!state.sessionId) return;
	analyticsStore.setState((draft) => ({
		...draft,
		lastActivityAtMs: Date.now(),
	}));
	updateIntervalState(typeof document !== "undefined" && document.hidden);
}

export function pushEvent(
	eventType: AnalyticsEventInsert["eventType"],
	overrides?: Partial<AnalyticsEventInsert>,
) {
	const state = analyticsStore.state;
	if (!state.sessionId || !state.actorId) return;

	const newEvent: AnalyticsEventInsert = {
		sessionId: state.sessionId,
		idempotencyKey: uuidv7(),
		pseudonymousActorId: state.actorId,
		actorType: state.actorType,
		authState: state.authState,
		teacherId: state.teacherId,
		eventType,
		occurredAt: new Date(),
		routeTemplate: state.currentRoute ?? "/",
		referrerTemplate: null,
		lessonId: null,
		classId: null,
		engagementSeconds: null,
		payloadJson: undefined,
		...overrides,
	};

	analyticsStore.setState((draft) => ({
		...draft,
		eventsBuffer: [...draft.eventsBuffer, newEvent],
	}));
}

export function getSessionMetrics() {
	const state = analyticsStore.state;
	if (!state.sessionId || !state.startedAtMs) {
		return { durationSeconds: 0, activeSeconds: 0, idleSeconds: 0 };
	}

	const now = Date.now();
	let activeMs = 0;
	let idleMs = 0;

	for (const interval of state.intervals) {
		const start = interval.start;
		const end = interval.end ?? now;
		const duration = Math.max(0, end - start);
		if (interval.type === "active") {
			activeMs += duration;
		} else {
			idleMs += duration;
		}
	}

	const durationSeconds = Math.max(
		1,
		Math.floor((now - state.startedAtMs) / 1000),
	);
	const activeSeconds = Math.floor(activeMs / 1000);
	const idleSeconds = Math.floor(idleMs / 1000);

	return { durationSeconds, activeSeconds, idleSeconds };
}

export function setCurrentRoute(route: string) {
	analyticsStore.setState((draft) => ({
		...draft,
		currentRoute: route,
	}));
}

export function clearEventsBuffer() {
	analyticsStore.setState((draft) => ({
		...draft,
		eventsBuffer: [],
	}));
}

export function getIngestPayload(isSessionEnding: boolean = false) {
	const state = analyticsStore.state;
	if (!state.sessionId || !state.actorId || !state.startedAtMs) return null;

	const { durationSeconds, activeSeconds, idleSeconds } = getSessionMetrics();

	const session: AnalyticsSessionInsert = {
		id: state.sessionId,
		pseudonymousActorId: state.actorId,
		actorType: state.actorType,
		authState: state.authState,
		roleBucket: state.roleBucket,
		teacherId: state.teacherId,
		entryRoute: state.entryRoute ?? "/",
		exitRoute: isSessionEnding ? state.currentRoute : null,
		deviceClass: state.deviceClass,
		osFamily: state.osFamily,
		browserFamily: state.browserFamily,
		startedAt: new Date(state.startedAtMs),
		endedAt: isSessionEnding ? new Date() : null,
		durationSeconds,
		activeSeconds,
		idleSeconds,
	};

	return {
		idempotencyKey: uuidv7(),
		sessions: [session],
		events: state.eventsBuffer,
	};
}
