import { createClientOnlyFn } from "@tanstack/react-start";

declare global {
	interface Navigator {
		userAgentData?: {
			mobile: boolean;
			platform: string;
			brands: Array<{ brand: string; version: string }>;
		};
	}
}

export const detectDeviceClass = createClientOnlyFn(
	(): "mobile" | "tablet" | "desktop" | "unknown" => {
		const ua = navigator.userAgent.toLowerCase();

		// 1. iPad maxTouchPoints fix (fixes iPad reporting as Mac)
		const isIPad =
			/ipad|tablet/.test(ua) ||
			(navigator.maxTouchPoints > 1 && /macintosh/i.test(navigator.userAgent));
		if (isIPad) return "tablet";

		// 2. Client hints for mobile
		if (navigator.userAgentData) {
			if (navigator.userAgentData.mobile) {
				return "mobile";
			}
			// If not mobile and not iPad, and client hints are present, it's highly likely a desktop
			if (navigator.userAgentData.brands.length > 0) {
				return "desktop";
			}
		}

		// 3. Fallbacks
		if (/mobi|android|iphone/.test(ua)) return "mobile";
		if (ua.length > 0) return "desktop";
		return "unknown";
	},
);

export const detectOsFamily = createClientOnlyFn((): string => {
	// 1. IPad fallback (must check before generic macOS)
	const ua = navigator.userAgent.toLowerCase();
	const isIPad =
		ua.includes("ipad") ||
		(navigator.maxTouchPoints > 1 && ua.includes("macintosh"));
	if (ua.includes("iphone") || isIPad || ua.includes("ios")) return "iOS";

	// 2. Client hints platform
	if (navigator.userAgentData && navigator.userAgentData.platform) {
		const platform = navigator.userAgentData.platform.toLowerCase();
		if (platform === "windows") return "Windows";
		if (platform === "android") return "Android";
		if (platform === "macos") return "macOS";
		if (platform === "chrome os") return "Chrome OS";
		if (platform === "linux") return "Linux";
	}

	// 3. Regex fallback
	if (ua.includes("windows")) return "Windows";
	if (ua.includes("android")) return "Android";
	if (ua.includes("mac os") || ua.includes("macintosh")) return "macOS";
	if (ua.includes("linux")) return "Linux";

	return "Unknown";
});

export const detectBrowserFamily = createClientOnlyFn((): string => {
	// 1. Client hints brands
	if (navigator.userAgentData && navigator.userAgentData.brands) {
		const brands = navigator.userAgentData.brands.map((b) =>
			b.brand.toLowerCase(),
		);
		if (brands.some((b) => b.includes("edge") || b.includes("edg")))
			return "Edge";
		if (brands.some((b) => b.includes("chrome"))) return "Chrome";
	}

	// 2. Regex fallback
	const ua = navigator.userAgent.toLowerCase();
	if (ua.includes("edg/")) return "Edge";
	if (ua.includes("firefox/")) return "Firefox";
	if (ua.includes("safari/") && !ua.includes("chrome/")) return "Safari";
	if (ua.includes("chrome/")) return "Chrome";
	return "Unknown";
});

export const getLocalStorageItem = createClientOnlyFn((key: string) =>
	window.localStorage.getItem(key),
);

export const setLocalStorageItem = createClientOnlyFn(
	(key: string, value: string) => {
		window.localStorage.setItem(key, value);
	},
);
