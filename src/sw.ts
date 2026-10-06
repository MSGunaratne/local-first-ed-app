/// <reference lib="webworker" />

import { BackgroundSyncPlugin } from "workbox-background-sync";
import { ExpirationPlugin } from "workbox-expiration";
import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { CacheFirst, NetworkOnly } from "workbox-strategies";
import { SYNC_SCOPES } from "./types/sync";

declare let self: ServiceWorkerGlobalScope;

const REPLAYED_MUTATIONS_EVENT = "OFFLINE_MUTATIONS_REPLAYED";
const PUBLIC_PAGE_CACHE = "public-pages-v2";
const IDENTITY_METADATA_CACHE = "offline-identity-v2";
const IDENTITY_METADATA_URL = "/__offline_identity__";
const LEGACY_CACHES = [
	"pages-cache",
	"api-cache",
	"static-assets",
	"images-cache",
	"ocr-data-cache",
];
const AUTH_PAGE_LIMIT = 15;
const PUBLIC_PAGE_LIMIT = 10;
const PAGE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
let activeIdentity: string | null = null;

// Install only the core shell. Heavy feature assets are cached after first use,
// so route-level code splitting still reduces initial installation cost.
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

registerRoute(
	({ request, url }) =>
		url.origin === self.location.origin &&
		["script", "style", "worker"].includes(request.destination),
	new CacheFirst({
		cacheName: "app-runtime-assets-v1",
		plugins: [
			new ExpirationPlugin({
				maxEntries: 80,
				maxAgeSeconds: 30 * 24 * 60 * 60,
			}),
		],
	}),
);

registerRoute(
	({ url }) =>
		url.origin === self.location.origin &&
		url.pathname.startsWith("/ocr-data/"),
	new CacheFirst({
		cacheName: "ocr-runtime-assets-v1",
		plugins: [
			new ExpirationPlugin({
				maxEntries: 8,
				maxAgeSeconds: 90 * 24 * 60 * 60,
			}),
		],
	}),
);

function authCacheName(identity: string) {
	return `auth-pages-v2-${identity}`;
}

function normalizedPath(pathname: string) {
	return pathname.replace(/^\/(en|si)(?=\/|$)/, "") || "/";
}

function isPublicNavigation(pathname: string) {
	const path = normalizedPath(pathname);
	return (
		path === "/" ||
		path === "/sign-in" ||
		path === "/sign-up" ||
		path === "/student" ||
		path.startsWith("/student/")
	);
}

async function getIdentity() {
	if (activeIdentity) return activeIdentity;
	const cache = await caches.open(IDENTITY_METADATA_CACHE);
	const response = await cache.match(IDENTITY_METADATA_URL);
	activeIdentity = (await response?.text()) || "anonymous";
	return activeIdentity;
}

async function setIdentity(identity: string) {
	activeIdentity = identity;
	const cache = await caches.open(IDENTITY_METADATA_CACHE);
	await cache.put(IDENTITY_METADATA_URL, new Response(identity));
}

async function cacheHtml(
	cacheName: string,
	request: Request,
	response: Response,
) {
	if (
		!response.ok ||
		!response.headers.get("content-type")?.includes("text/html")
	) {
		return;
	}
	const headers = new Headers(response.headers);
	headers.set("x-offline-cached-at", String(Date.now()));
	const cached = new Response(await response.clone().blob(), {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
	const cache = await caches.open(cacheName);
	await cache.put(request, cached);
	await prunePageCache(
		cacheName,
		cacheName === PUBLIC_PAGE_CACHE ? PUBLIC_PAGE_LIMIT : AUTH_PAGE_LIMIT,
	);
}

async function prunePageCache(cacheName: string, maxEntries: number) {
	const cache = await caches.open(cacheName);
	const requests = await cache.keys();
	const entries = await Promise.all(
		requests.map(async (request) => {
			const response = await cache.match(request);
			return {
				request,
				cachedAt: Number(response?.headers.get("x-offline-cached-at") ?? 0),
			};
		}),
	);
	const now = Date.now();
	for (const entry of entries) {
		if (!entry.cachedAt || now - entry.cachedAt > PAGE_MAX_AGE_MS) {
			await cache.delete(entry.request);
		}
	}
	const retained = entries
		.filter(
			(entry) => entry.cachedAt && now - entry.cachedAt <= PAGE_MAX_AGE_MS,
		)
		.sort((a, b) => b.cachedAt - a.cachedAt);
	for (const entry of retained.slice(maxEntries))
		await cache.delete(entry.request);
}

async function fetchNavigation(request: Request) {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 3_000);
	try {
		return await fetch(new Request(request, { signal: controller.signal }));
	} finally {
		clearTimeout(timeout);
	}
}

async function handleNavigation(request: Request, url: URL) {
	const publicRoute = isPublicNavigation(url.pathname);
	const identity = await getIdentity();
	const cacheName = publicRoute
		? PUBLIC_PAGE_CACHE
		: identity !== "anonymous"
			? authCacheName(identity)
			: null;

	try {
		const response = await fetchNavigation(request);
		if (cacheName) await cacheHtml(cacheName, request, response);
		return response;
	} catch {
		if (cacheName) {
			const exact = await (await caches.open(cacheName)).match(request, {
				ignoreSearch: false,
			});
			if (exact) return exact;
		}
		return (
			(await caches.match("/offline.html")) ??
			new Response("Offline", { status: 503 })
		);
	}
}

registerRoute(
	new NavigationRoute(({ request, url }) => handleNavigation(request, url)),
);

const analyticsSync = new BackgroundSyncPlugin("analytics-queue", {
	maxRetentionTime: 24 * 60,
	onSync: async ({ queue }) => {
		await queue.replayRequests();
		const clients = await self.clients.matchAll({
			type: "window",
			includeUncontrolled: true,
		});
		for (const client of clients) {
			client.postMessage({
				type: REPLAYED_MUTATIONS_EVENT,
				queryScopes: SYNC_SCOPES,
			});
		}
	},
});

registerRoute(
	({ url, request }) =>
		request.method === "POST" && url.pathname === "/api/analytics/ingest",
	new NetworkOnly({ plugins: [analyticsSync] }),
);

async function warmAuthenticatedRoute(urlValue: unknown) {
	if (typeof urlValue !== "string") return;
	const url = new URL(urlValue, self.location.origin);
	if (url.origin !== self.location.origin || isPublicNavigation(url.pathname))
		return;
	const identity = await getIdentity();
	if (identity === "anonymous") return;
	const request = new Request(url.href, {
		headers: { Accept: "text/html" },
		credentials: "include",
	});
	const response = await fetchNavigation(request);
	await cacheHtml(authCacheName(identity), request, response);
}

self.addEventListener("message", (event) => {
	const message = event.data as Record<string, unknown> | null;
	const reply = () => event.ports[0]?.postMessage({ ok: true });
	if (!message) return;
	if (message.type === "SKIP_WAITING") {
		void self.skipWaiting().then(reply);
		return;
	}
	if (message.type === "MUTATIONS_FLUSHED") {
		const task = self.clients
			.matchAll({ type: "window", includeUncontrolled: true })
			.then((clients) => {
				for (const client of clients) {
					client.postMessage({
						type: REPLAYED_MUTATIONS_EVENT,
						queryScopes: SYNC_SCOPES,
					});
				}
			});
		event.waitUntil(task.finally(reply));
		return;
	}

	const task = (async () => {
		if (
			message.type === "SET_CACHE_IDENTITY" &&
			typeof message.identity === "string"
		) {
			await setIdentity(message.identity);
		} else if (
			message.type === "CLEAR_CACHE_IDENTITY" &&
			typeof message.identity === "string"
		) {
			await caches.delete(authCacheName(message.identity));
			if ((await getIdentity()) === message.identity)
				await setIdentity("anonymous");
		} else if (message.type === "WARM_AUTH_ROUTE") {
			await warmAuthenticatedRoute(message.url);
		}
	})();
	event.waitUntil(task.finally(reply));
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		Promise.all([
			self.clients.claim(),
			...LEGACY_CACHES.map((cacheName) => caches.delete(cacheName)),
		]),
	);
});
