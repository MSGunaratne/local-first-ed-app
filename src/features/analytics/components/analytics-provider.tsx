import { useQuery } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useSelector } from "@tanstack/react-store";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
} from "react";
import { authQueries } from "@/features/auth/auth.queries";
import { Role } from "@/types/user";
import type { AnalyticsEventInsert } from "../analytics.schema";
import {
	analyticsStore,
	clearEventsBuffer,
	getIngestPayload,
	initSession,
	markActive,
	pushEvent,
	setActorContext,
	setCurrentRoute,
	updateIntervalState,
} from "../client/analytics-store";
import { getDailyPseudonymousActorId } from "../client/pseudonymous-id";

// Add experimental window.fetchLater type
declare global {
	interface Window {
		fetchLater?: (
			url: string,
			init?: RequestInit & { activateAfter?: number },
		) => { activated: boolean };
	}
	interface Window {
		_trackEvent?: (
			eventType: AnalyticsEventInsert["eventType"],
			overrides?: Partial<AnalyticsEventInsert>,
		) => void;
	}
}

interface AnalyticsContextValue {
	trackEvent: (
		eventType: AnalyticsEventInsert["eventType"],
		payload?: Record<string, unknown>,
	) => void;
	sessionId: string | null;
}

const AnalyticsContext = createContext<AnalyticsContextValue | null>(null);

function useEvent<T extends (...args: any[]) => any>(handler: T): T {
	const handlerRef = useRef<T>(handler);
	useEffect(() => {
		handlerRef.current = handler;
	});
	return useCallback((...args: Parameters<T>) => {
		return handlerRef.current(...args);
	}, []) as T;
}

const INGEST_URL = "/api/analytics/ingest";

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
	const router = useRouter();
	const { data: authSession } = useQuery(authQueries.session());
	const sessionId = useSelector(analyticsStore, (state) => state.sessionId);
	const eventsBuffer = useSelector(
		analyticsStore,
		(state) => state.eventsBuffer,
	);

	// 1. Sync Actor Context
	useEffect(() => {
		const role = authSession?.user.role;
		const authState = authSession ? "authenticated" : "anonymous";
		const actorType =
			role === Role.ADMIN || role === Role.SUPER_ADMIN
				? "admin"
				: role === Role.TEACHER
					? "teacher"
					: "anonymous";

		const roleBucket =
			role === Role.ADMIN || role === Role.SUPER_ADMIN || role === Role.TEACHER
				? role
				: null;

		setActorContext({
			actorType,
			authState,
			roleBucket,
			teacherId:
				role === Role.TEACHER && typeof authSession?.user.id === "string"
					? authSession.user.id
					: null,
		});
	}, [authSession]);

	// 2. Initial Session Load
	useEffect(() => {
		if (typeof window === "undefined") return;

		const start = async () => {
			if (analyticsStore.state.sessionId) return; // Already initialized

			const matches = router.state.matches;
			const initialMatch = matches[matches.length - 1];
			const route =
				initialMatch && initialMatch.routeId !== "__root__"
					? initialMatch.routeId
					: "/";

			const actorId = await getDailyPseudonymousActorId();
			initSession(actorId, route);

			const state = analyticsStore.state;
			pushEvent("session_start", {
				payloadJson: {
					deviceClass: state.deviceClass,
					osFamily: state.osFamily,
					browserFamily: state.browserFamily,
				},
			});

			let lessonId: string | null = null;
			let classId: string | null = null;
			for (const match of matches) {
				if (match.params) {
					if ("lessonId" in match.params)
						lessonId = match.params.lessonId as string;
					if ("classId" in match.params)
						classId = match.params.classId as string;
				}
			}

			pushEvent("page_view", {
				routeTemplate: route,
				referrerTemplate: null,
				lessonId,
				classId,
			});
		};

		void start();
	}, [router]);

	// 3. Router Subscription
	useEffect(() => {
		const unsubscribe = router.subscribe("onResolved", () => {
			const matches = router.state.matches;
			const leafMatch = matches[matches.length - 1];
			const nextRoute =
				leafMatch && leafMatch.routeId !== "__root__" ? leafMatch.routeId : "/";

			const previous = analyticsStore.state.currentRoute;
			if (nextRoute !== previous) {
				setCurrentRoute(nextRoute);

				let lessonId: string | null = null;
				let classId: string | null = null;

				for (const match of matches) {
					if (match.params) {
						if ("lessonId" in match.params)
							lessonId = match.params.lessonId as string;
						if ("classId" in match.params)
							classId = match.params.classId as string;
					}
				}

				pushEvent("page_view", {
					routeTemplate: nextRoute,
					referrerTemplate: previous,
					lessonId,
					classId,
				});
			}
		});

		return unsubscribe;
	}, [router]);

	// 4. Reliable Delivery mechanism
	const fetchLaterAbortController = useRef<AbortController | null>(null);

	const flushIngest = useEvent((isSessionEnding: boolean) => {
		const payload = getIngestPayload(isSessionEnding);
		if (
			!payload ||
			(payload.sessions.length === 0 && payload.events.length === 0)
		) {
			return;
		}

		const body = JSON.stringify(payload);

		if (isSessionEnding) {
			// Abort any pending fetchLater
			if (fetchLaterAbortController.current) {
				fetchLaterAbortController.current.abort();
				fetchLaterAbortController.current = null;
			}

			if ("fetchLater" in window && typeof window.fetchLater === "function") {
				window.fetchLater(INGEST_URL, {
					method: "POST",
					body,
				});
			} else if ("sendBeacon" in navigator) {
				navigator.sendBeacon(INGEST_URL, body);
			} else {
				fetch(INGEST_URL, {
					method: "POST",
					body,
					keepalive: true,
				}).catch(() => {});
			}
		} else {
			// Routine flush (e.g., when buffer full or periodically)
			fetch(INGEST_URL, {
				method: "POST",
				body,
				headers: { "Content-Type": "application/json" },
			}).catch(() => {});
		}

		clearEventsBuffer();
	});

	// Schedule deferred fetchLater
	useEffect(() => {
		if (typeof window === "undefined" || !("fetchLater" in window)) return;
		if (!sessionId) return;

		// When store changes, replace the deferred beacon
		if (fetchLaterAbortController.current) {
			fetchLaterAbortController.current.abort();
		}
		fetchLaterAbortController.current = new AbortController();

		const payload = getIngestPayload(true);
		if (payload) {
			window.fetchLater?.(INGEST_URL, {
				method: "POST",
				body: JSON.stringify(payload),
				signal: fetchLaterAbortController.current.signal,
				activateAfter: 5 * 60 * 1000, // 5 minutes max delay
			});
		}
	}, [sessionId, eventsBuffer]);

	// 5. Lifecycle and Visibility
	useEffect(() => {
		if (typeof window === "undefined") return;

		const onActivity = () => markActive();

		const onVisibilityChange = () => {
			const isHidden = document.visibilityState === "hidden";
			updateIntervalState(isHidden);

			if (isHidden) {
				flushIngest(true);
			} else {
				markActive();
			}
		};

		const onPageHide = (event: PageTransitionEvent) => {
			updateIntervalState(true);
			flushIngest(!event.persisted); // End session entirely if not bfcache
		};

		window.addEventListener("mousemove", onActivity, { passive: true });
		window.addEventListener("keydown", onActivity, { passive: true });
		window.addEventListener("touchstart", onActivity, { passive: true });
		window.addEventListener("scroll", onActivity, { passive: true });

		document.addEventListener("visibilitychange", onVisibilityChange);
		window.addEventListener("pagehide", onPageHide);

		return () => {
			window.removeEventListener("mousemove", onActivity);
			window.removeEventListener("keydown", onActivity);
			window.removeEventListener("touchstart", onActivity);
			window.removeEventListener("scroll", onActivity);
			document.removeEventListener("visibilitychange", onVisibilityChange);
			window.removeEventListener("pagehide", onPageHide);
		};
	}, [flushIngest]);

	// Buffer auto-flush
	useEffect(() => {
		if (eventsBuffer.length >= 20) {
			flushIngest(false);
		}
	}, [eventsBuffer.length, flushIngest]);

	// Global window tracking
	useEffect(() => {
		window._trackEvent = pushEvent;
		return () => {
			delete window._trackEvent;
		};
	}, []);

	const contextValue = useMemo<AnalyticsContextValue>(
		() => ({
			trackEvent: (type, payload) => {
				pushEvent(type, { payloadJson: payload });
			},
			sessionId,
		}),
		[sessionId],
	);

	return (
		<AnalyticsContext.Provider value={contextValue}>
			{children}
		</AnalyticsContext.Provider>
	);
}

export function useAnalytics() {
	const context = useContext(AnalyticsContext);
	if (!context) {
		throw new Error("useAnalytics must be used within an AnalyticsProvider");
	}
	return context;
}
