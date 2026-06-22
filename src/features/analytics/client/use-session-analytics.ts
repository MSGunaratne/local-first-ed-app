import { useAnalytics } from "../components/analytics-provider";

/**
 * Hook to access analytics tracking functions.
 * Must be used within an <AnalyticsProvider>.
 *
 * @example
 * const { trackEvent } = useAnalytics();
 * trackEvent('custom_action', { foo: 'bar' });
 */
export function useSessionAnalytics() {
	return useAnalytics();
}
