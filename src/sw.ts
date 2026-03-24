/// <reference lib="webworker" />
import { BackgroundSyncPlugin } from "workbox-background-sync";
import { clientsClaim } from "workbox-core";
import { ExpirationPlugin } from "workbox-expiration";
import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";
import { offlineFallback } from "workbox-recipes";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { CacheFirst, NetworkFirst, NetworkOnly } from "workbox-strategies";

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

// Precache static assets (injected by workbox-build)
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Take control immediately
clientsClaim();

// Skip waiting when requested
self.addEventListener("message", (event) => {
	if (event.data && event.data.type === "SKIP_WAITING") {
		self.skipWaiting();
	}
});

const bgSyncPlugin = new BackgroundSyncPlugin("offline-mutations", {
	maxRetentionTime: 24 * 60, // Retry for 24 hours
	onSync: async ({ queue }) => {
		await queue.replayRequests();
		await notifyReplaySuccess();
	},
});

// Queue failed mutations (POST, PUT, DELETE, PATCH) for background sync
registerRoute(
	({ request, url }) =>
		request.method !== "GET" &&
		(url.pathname.startsWith("/_server") || url.pathname.includes("/api/")),
	new NetworkOnly({
		plugins: [bgSyncPlugin],
	}),
	"POST",
);

registerRoute(
	({ request, url }) =>
		request.method !== "GET" &&
		(url.pathname.startsWith("/_server") || url.pathname.includes("/api/")),
	new NetworkOnly({
		plugins: [bgSyncPlugin],
	}),
	"PUT",
);

registerRoute(
	({ request, url }) =>
		request.method !== "GET" &&
		(url.pathname.startsWith("/_server") || url.pathname.includes("/api/")),
	new NetworkOnly({
		plugins: [bgSyncPlugin],
	}),
	"DELETE",
);

registerRoute(
	({ request, url }) =>
		request.method !== "GET" &&
		(url.pathname.startsWith("/_server") || url.pathname.includes("/api/")),
	new NetworkOnly({
		plugins: [bgSyncPlugin],
	}),
	"PATCH",
);

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
		(url.pathname.startsWith("/_server") ||
			url.pathname.includes("/api/") ||
			url.hostname.includes(".convex.cloud")),
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
				maxEntries: 50,
				maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
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
