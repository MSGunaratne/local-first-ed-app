import type { AnalyticsEventInsert } from "../features/analytics/analytics.schema";

declare global {
	interface Window {
		_trackEvent?: (
			eventType: AnalyticsEventInsert["eventType"],
			overrides?: Partial<AnalyticsEventInsert>,
		) => void;
	}
}
