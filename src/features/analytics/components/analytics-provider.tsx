import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { createContext, useContext, useEffect, useMemo, useRef } from "react";
import { uuidv7 } from "uuidv7";
import { authQueries } from "@/features/auth/auth.queries";
import { Role } from "@/types/user";
import { analyticsMutations } from "../analytics.queries";
import type {
	AnalyticsEventInsert,
	AnalyticsSessionInsert,
} from "../analytics.schema";
import { getBrowserUserAgent } from "../client/browser-env";
import { getDailyPseudonymousActorId } from "../client/pseudonymous-id";
import { toRouteTemplate } from "../client/route-template";

// ----------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------

type SessionRuntime = {
	id: string;
	startedAtMs: number;
	lastActivityAtMs: number;
	activeSeconds: number;
	idleSeconds: number;
	entryRoute: string;
};

type ActorContext = {
	actorType: "anonymous" | "teacher" | "admin";
	authState: "anonymous" | "authenticated";
	roleBucket: AnalyticsSessionInsert["roleBucket"];
	teacherId: string | null;
};

interface AnalyticsContextValue {
	trackEvent: (
		eventType: AnalyticsEventInsert["eventType"],
		payload?: Record<string, unknown>,
	) => void;
	sessionId: string | null;
}

const AnalyticsContext = createContext<AnalyticsContextValue | null>(null);

// ----------------------------------------------------------------------
// Utilities
// ----------------------------------------------------------------------

function detectDeviceClass(): "mobile" | "tablet" | "desktop" | "unknown" {
	const ua = getBrowserUserAgent().toLowerCase();
	if (/ipad|tablet/.test(ua)) return "tablet";
	if (/mobi|android|iphone/.test(ua)) return "mobile";
	if (ua.length > 0) return "desktop";
	return "unknown";
}

function detectOsFamily(): string {
	const ua = getBrowserUserAgent().toLowerCase();
	if (ua.includes("windows")) return "Windows";
	if (ua.includes("android")) return "Android";
	if (ua.includes("iphone") || ua.includes("ipad") || ua.includes("ios"))
		return "iOS";
	if (ua.includes("mac os") || ua.includes("macintosh")) return "macOS";
	if (ua.includes("linux")) return "Linux";
	return "Unknown";
}

function detectBrowserFamily(): string {
	const ua = getBrowserUserAgent().toLowerCase();
	if (ua.includes("edg/")) return "Edge";
	if (ua.includes("firefox/")) return "Firefox";
	if (ua.includes("safari/") && !ua.includes("chrome/")) return "Safari";
	if (ua.includes("chrome/")) return "Chrome";
	return "Unknown";
}

// ----------------------------------------------------------------------
// Provider
// ----------------------------------------------------------------------

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
	const router = useRouter();
	const sessionRuntimeRef = useRef<SessionRuntime | null>(null);
	const actorIdRef = useRef<string>("pending");
	const routeRef = useRef<string>("/");
	const eventsRef = useRef<AnalyticsEventInsert[]>([]);
	const flushedOnExitRef = useRef(false);

	const { data: authSession } = useQuery(authQueries.session());
	const ingestMutation = useMutation(analyticsMutations.ingestBatch());
	const ingestMutateRef = useRef(ingestMutation.mutate);

	const actorContextRef = useRef<ActorContext>({
		actorType: "anonymous",
		authState: "anonymous",
		roleBucket: null,
		teacherId: null,
	});

	// Sync mutation ref for use in stable callbacks
	useEffect(() => {
		ingestMutateRef.current = ingestMutation.mutate;
	}, [ingestMutation.mutate]);

	// Sync actor context from auth session
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

		actorContextRef.current = {
			actorType,
			authState,
			roleBucket,
			teacherId:
				role === Role.TEACHER && typeof authSession?.user.id === "string"
					? authSession.user.id
					: null,
		};
	}, [authSession]);

	// Core Tracking Logic
	useEffect(() => {
		if (typeof window === "undefined") return;

		function flushBufferedEvents() {
			if (eventsRef.current.length === 0) return;
			const batch = [...eventsRef.current];
			eventsRef.current = [];
			ingestMutateRef.current({ sessions: [], events: batch });
		}

		function pushEvent(
			eventType: AnalyticsEventInsert["eventType"],
			overrides?: Partial<AnalyticsEventInsert>,
		) {
			const runtime = sessionRuntimeRef.current;
			if (!runtime) return;

			const context = actorContextRef.current;

			eventsRef.current.push({
				sessionId: runtime.id,
				idempotencyKey: uuidv7(),
				pseudonymousActorId: actorIdRef.current,
				actorType: context.actorType,
				authState: context.authState,
				teacherId: context.teacherId,
				eventType,
				occurredAt: new Date(),
				routeTemplate: routeRef.current,
				referrerTemplate: null,
				lessonId: null,
				classId: null,
				engagementSeconds: null,
				payloadJson: undefined,
				...overrides,
			});

			if (eventsRef.current.length >= 20) {
				flushBufferedEvents();
			}
		}

		function endSession() {
			if (flushedOnExitRef.current) return;
			const runtime = sessionRuntimeRef.current;
			if (!runtime) return;

			const endedAtMs = Date.now();
			const durationSeconds = Math.max(
				1,
				Math.floor((endedAtMs - runtime.startedAtMs) / 1000),
			);
			const context = actorContextRef.current;
			const sessionRow: AnalyticsSessionInsert = {
				pseudonymousActorId: actorIdRef.current,
				actorType: context.actorType,
				authState: context.authState,
				roleBucket: context.roleBucket,
				teacherId: context.teacherId,
				entryRoute: runtime.entryRoute,
				exitRoute: routeRef.current,
				deviceClass: detectDeviceClass(),
				osFamily: detectOsFamily(),
				browserFamily: detectBrowserFamily(),
				startedAt: new Date(runtime.startedAtMs),
				endedAt: new Date(endedAtMs),
				durationSeconds,
				activeSeconds: runtime.activeSeconds,
				idleSeconds: runtime.idleSeconds,
			};

			pushEvent("session_end", {
				engagementSeconds: runtime.activeSeconds,
				payloadJson: {
					durationSeconds,
					activeSeconds: runtime.activeSeconds,
					idleSeconds: runtime.idleSeconds,
					reason: "lifecycle_end",
				},
			});

			const pendingEvents = [...eventsRef.current];
			eventsRef.current = [];
			ingestMutateRef.current({
				sessions: [sessionRow],
				events: pendingEvents,
			});
			flushedOnExitRef.current = true;
		}

		const startSession = async () => {
			if (typeof window !== "undefined") {
				routeRef.current = toRouteTemplate(window.location.pathname);
			}
			actorIdRef.current = await getDailyPseudonymousActorId();
			const now = Date.now();
			sessionRuntimeRef.current = {
				id: uuidv7(),
				startedAtMs: now,
				lastActivityAtMs: now,
				activeSeconds: 0,
				idleSeconds: 0,
				entryRoute: routeRef.current,
			};

			flushedOnExitRef.current = false;
			pushEvent("session_start", {
				payloadJson: {
					deviceClass: detectDeviceClass(),
					osFamily: detectOsFamily(),
					browserFamily: detectBrowserFamily(),
				},
			});
		};

		void startSession();

		// Activity tracking
		const markActive = () => {
			const runtime = sessionRuntimeRef.current;
			if (!runtime) return;
			runtime.lastActivityAtMs = Date.now();
		};

		// Global heartbeats
		const heartbeatInterval = window.setInterval(() => {
			const runtime = sessionRuntimeRef.current;
			if (!runtime) return;

			const nowMs = Date.now();
			const idleForMs = nowMs - runtime.lastActivityAtMs;
			if (idleForMs > 60_000 || document.hidden) {
				runtime.idleSeconds += 15;
			} else {
				runtime.activeSeconds += 15;
			}

			pushEvent("engagement_heartbeat", {
				engagementSeconds: 15,
				payloadJson: { idleForMs, documentHidden: document.hidden },
			});
		}, 15_000);

		const flushInterval = window.setInterval(() => {
			flushBufferedEvents();
		}, 10_000);

		// Global Listeners
		window.addEventListener("mousemove", markActive, { passive: true });
		window.addEventListener("keydown", markActive);
		window.addEventListener("touchstart", markActive, { passive: true });
		window.addEventListener("scroll", markActive, { passive: true });
		window.addEventListener("pagehide", endSession);

		const onVisibilityChange = () => {
			if (document.hidden) flushBufferedEvents();
		};
		document.addEventListener("visibilitychange", onVisibilityChange);

		// Route changes
		const unsubscribeRoute = router.subscribe(
			"onResolved",
			({ toLocation }) => {
				const nextRoute = toRouteTemplate(toLocation.pathname);
				const previous = routeRef.current;
				routeRef.current = nextRoute;

				if (nextRoute !== previous) {
					pushEvent("page_view", {
						routeTemplate: nextRoute,
						referrerTemplate: previous,
					});
				}
			},
		);

		// Manual tracking exposing
		window._trackEvent = pushEvent;

		return () => {
			window.clearInterval(heartbeatInterval);
			window.clearInterval(flushInterval);
			window.removeEventListener("mousemove", markActive);
			window.removeEventListener("keydown", markActive);
			window.removeEventListener("touchstart", markActive);
			window.removeEventListener("scroll", markActive);
			window.removeEventListener("pagehide", endSession);
			document.removeEventListener("visibilitychange", onVisibilityChange);
			unsubscribeRoute();
			endSession();
		};
	}, [router]);

	const contextValue = useMemo<AnalyticsContextValue>(
		() => ({
			trackEvent: (type, payload) => {
				if (typeof window !== "undefined" && window._trackEvent) {
					window._trackEvent(type, { payloadJson: payload });
				}
			},
			sessionId: sessionRuntimeRef.current?.id ?? null,
		}),
		[],
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
