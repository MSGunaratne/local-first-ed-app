/// <reference lib="webworker" />
import { ExpirationPlugin } from "workbox-expiration";
import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";
import { offlineFallback } from "workbox-recipes";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { CacheFirst, NetworkFirst, NetworkOnly } from "workbox-strategies";
import { BackgroundSyncPlugin } from "workbox-background-sync";

declare let self: ServiceWorkerGlobalScope;
const REPLAYED_MUTATIONS_EVENT = "OFFLINE_MUTATIONS_REPLAYED";
const REPLAYED_QUERY_SCOPES = ["users", "lessons", "classes"];

async function notifyReplaySuccess() {
	const clientList = await self.clients.matchAll({
		type: "window",
		includeUncontrolled: true,
	});

	for (const client of clientList) {
		client.postMessage({
			type: REPLAYED_MUTATIONS_EVENT,
			queryScopes: REPLAYED_QUERY_SCOPES,
		});
	}
}

// Precache: filter out large OCR data files for lazy loading

const fullManifest = self.__WB_MANIFEST;
const filteredManifest = fullManifest.filter((entry) => {
	const url = typeof entry === "string" ? entry : entry.url;
	return !url.includes("ocr-data/");
});
precacheAndRoute(filteredManifest);
cleanupOutdatedCaches();

// Prefer explicit activation claim for predictable update behavior across tabs.
self.addEventListener("activate", (event) => {
	event.waitUntil(self.clients.claim());
});

// Message handler: skip waiting + flush mutation queue
self.addEventListener("message", (event) => {
	if (event.data && event.data.type === "SKIP_WAITING") {
		self.skipWaiting();
	}

	if (event.data && event.data.type === "MUTATIONS_FLUSHED") {
		void notifyReplaySuccess();
	}
});

// ----------------------------------------------------------------------
// Navigation requests: NetworkFirst with offline fallback
// Caches SSR-rendered HTML pages for offline access
// ----------------------------------------------------------------------

registerRoute(
	new NavigationRoute(
		new NetworkFirst({
			cacheName: "pages-cache",
			networkTimeoutSeconds: 3,
			plugins: [
				new ExpirationPlugin({
					maxEntries: 50,
					maxAgeSeconds: 24 * 60 * 60, // 24 hours
				}),
			],
		}),
	),
);

// ----------------------------------------------------------------------
// Server functions / API requests: NetworkFirst with timeout
// Matches TanStack Start server function GET endpoints
// ----------------------------------------------------------------------

registerRoute(
	({ request, url }) =>
		request.method === "GET" &&
		(url.pathname.startsWith("/_server") || url.pathname.includes("/api/")),
	new NetworkFirst({
		cacheName: "api-cache",
		networkTimeoutSeconds: 3,
		plugins: [
			new ExpirationPlugin({
				maxEntries: 100,
				maxAgeSeconds: 24 * 60 * 60, // 24 hours
			}),
		],
	}),
);

// ----------------------------------------------------------------------
// Analytics Ingestion: NetworkOnly + Background Sync
// ----------------------------------------------------------------------

const bgSyncPlugin = new BackgroundSyncPlugin("analytics-queue", {
	maxRetentionTime: 24 * 60, // Retry for max of 24 Hours (specified in minutes)
});

registerRoute(
	({ url, request }) =>
		request.method === "POST" && url.pathname === "/api/analytics/ingest",
	new NetworkOnly({
		plugins: [bgSyncPlugin],
	}),
);

// ----------------------------------------------------------------------
// Static assets: CacheFirst for performance
// ----------------------------------------------------------------------

registerRoute(
	({ request }) =>
		request.destination === "style" ||
		request.destination === "script" ||
		request.destination === "font",
	new CacheFirst({
		cacheName: "static-assets",
		plugins: [
			new ExpirationPlugin({
				maxEntries: 100,
				maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
			}),
		],
	}),
);

// ----------------------------------------------------------------------
// Images: CacheFirst with longer expiration
// ----------------------------------------------------------------------

registerRoute(
	({ request }) => request.destination === "image",
	new CacheFirst({
		cacheName: "images-cache",
		plugins: [
			new ExpirationPlugin({
				maxEntries: 20,
				maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
			}),
		],
	}),
);

// ----------------------------------------------------------------------
// OCR data: CacheFirst, loaded on-demand (not precached)
// ----------------------------------------------------------------------

registerRoute(
	({ url }) => url.pathname.includes("/ocr-data/"),
	new CacheFirst({
		cacheName: "ocr-data-cache",
		plugins: [
			new ExpirationPlugin({
				maxEntries: 10,
				maxAgeSeconds: 90 * 24 * 60 * 60, // 90 days
			}),
		],
	}),
);

// ----------------------------------------------------------------------
// Offline fallback: Show friendly page when navigating to uncached pages
// ----------------------------------------------------------------------

offlineFallback({
	pageFallback: "/offline.html",
});
