export const ANALYTICS_EVENT_TYPES = [
	"session_start",
	"page_view",
	"engagement_heartbeat",
	"interaction",
	"session_end",
	"lesson_create",
	"class_view",
	"lesson_feedback_submitted",
	"lesson_started",
	"lesson_completed",
] as const;

export type AnalyticsEventType = (typeof ANALYTICS_EVENT_TYPES)[number];

// ----------------------------------------------------------------------

export const ACTOR_TYPES = ["anonymous", "teacher", "admin"] as const;

export type AnalyticsActorType = (typeof ACTOR_TYPES)[number];

// ----------------------------------------------------------------------

export const AUTH_STATES = ["anonymous", "authenticated"] as const;

export type AnalyticsAuthState = (typeof AUTH_STATES)[number];

// ----------------------------------------------------------------------

export const DEVICE_CLASSES = [
	"mobile",
	"tablet",
	"desktop",
	"unknown",
] as const;

export type AnalyticsDeviceClass = (typeof DEVICE_CLASSES)[number];
