import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { Workbox } from "workbox-window";

// Update check interval: 1 hour
const UPDATE_INTERVAL_MS = 60 * 60 * 1000;
const APP_CACHE_PREFIXES = [
	"workbox-precache",
	"public-pages-",
	"auth-pages-",
	"offline-identity-",
	"pages-cache",
	"api-cache",
	"static-assets",
	"images-cache",
	"ocr-data-cache",
];

function isApplicationCache(cacheName: string) {
	return APP_CACHE_PREFIXES.some((prefix) => cacheName.startsWith(prefix));
}

function useServiceWorker() {
	const [needRefresh, setNeedRefresh] = useState(false);
	const [offlineReady, setOfflineReady] = useState(false);

	const wbRef = useRef<Workbox | null>(null);
	const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
	const updateIntervalRef = useRef<number | null>(null);

	const updateServiceWorker = useCallback(async () => {
		const wb = wbRef.current;
		const registration = registrationRef.current;

		if (wb && registration?.waiting) {
			// Dynamically import messageSW for the action
			const { messageSW } = await import("workbox-window");
			// Send skip waiting message to the waiting SW
			messageSW(registration.waiting, { type: "SKIP_WAITING" });
		}
	}, []);

	useEffect(() => {
		if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
			return;
		}
		let cancelled = false;

		if (import.meta.env.DEV) {
			void (async () => {
				const hadController = navigator.serviceWorker.controller !== null;
				const registrations = await navigator.serviceWorker.getRegistrations();
				await Promise.all(
					registrations.map((registration) => registration.unregister()),
				);

				if ("caches" in window) {
					const cacheNames = await caches.keys();
					await Promise.all(
						cacheNames
							.filter(isApplicationCache)
							.map((cacheName) => caches.delete(cacheName)),
					);
				}

				// An unregistered worker can keep controlling this document until the
				// next navigation. Always reload once when a stale controller existed;
				// the removed registration means the new document cannot loop here.
				if (hadController && !cancelled) window.location.reload();
			})().catch((error: unknown) => {
				console.error("Development service worker cleanup failed:", error);
			});

			return () => {
				cancelled = true;
			};
		}

		const registerServiceWorker = async () => {
			try {
				const { Workbox } = await import("workbox-window");

				if (cancelled) {
					return;
				}

				const wb = new Workbox("/sw.js", { type: "module" });
				wbRef.current = wb;

				wb.addEventListener("installed", (event) => {
					if (!event.isUpdate) {
						setOfflineReady(true);
					}
				});

				wb.addEventListener("waiting", () => {
					setNeedRefresh(true);
				});

				wb.addEventListener("controlling", () => {
					window.location.reload();
				});

				wb.addEventListener("activated", (event) => {
					console.log(
						"SW activated:",
						event.isUpdate ? "updated" : "first install",
					);
				});

				const registration = await wb.register();

				if (cancelled || !registration) {
					return;
				}

				registrationRef.current = registration;

				if (registration.waiting) {
					setNeedRefresh(true);
				}

				updateIntervalRef.current = window.setInterval(() => {
					registration.update().catch((error: unknown) => {
						console.error("Service worker update check failed:", error);
					});
				}, UPDATE_INTERVAL_MS);
			} catch (error) {
				console.error("Service worker registration failed:", error);

				try {
					const swResponse = await fetch("/sw.js", {
						cache: "no-store",
						headers: {
							accept: "application/javascript,text/javascript,*/*",
						},
					});
					const swBody = await swResponse.text();
					console.error("Service worker script diagnostics:", {
						status: swResponse.status,
						contentType: swResponse.headers.get("content-type"),
						bodySnippet: swBody.slice(0, 500),
					});
				} catch (diagnosticError) {
					console.error(
						"Failed to fetch service worker diagnostics:",
						diagnosticError,
					);
				}

				toast.error("Offline support is unavailable right now.", {
					description:
						"The app will keep working, but offline updates are disabled.",
				});
			}
		};

		void registerServiceWorker();

		return () => {
			cancelled = true;
			if (updateIntervalRef.current) {
				window.clearInterval(updateIntervalRef.current);
				updateIntervalRef.current = null;
			}

			wbRef.current = null;
			registrationRef.current = null;
		};
	}, []);

	return {
		offlineReady,
		setOfflineReady,
		needRefresh,
		setNeedRefresh,
		updateServiceWorker,
	};
}

function ReloadPromptInner() {
	const {
		offlineReady,
		setOfflineReady,
		needRefresh,
		setNeedRefresh,
		updateServiceWorker,
	} = useServiceWorker();

	useEffect(() => {
		if (offlineReady) {
			toast.success("App ready to work offline", {
				duration: 3000,
				description: "Your changes will sync when you're back online.",
			});
			// Reset state after showing
			const timer = setTimeout(() => setOfflineReady(false), 3000);
			return () => clearTimeout(timer);
		}
	}, [offlineReady, setOfflineReady]);

	useEffect(() => {
		if (needRefresh) {
			toast.info("New content available", {
				id: "sw-update",
				duration: Infinity,
				description: "Click reload to update the app.",
				action: {
					label: "Reload",
					onClick: () => updateServiceWorker(),
				},
				cancel: {
					label: "Later",
					onClick: () => setNeedRefresh(false),
				},
			});
		} else {
			// Dismiss the toast if user clicked "Later"
			toast.dismiss("sw-update");
		}
	}, [needRefresh, updateServiceWorker, setNeedRefresh]);

	return null;
}

export function ReloadPrompt() {
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
	}, []);

	// Only render on client to avoid SSR hydration issues
	if (!mounted) return null;

	return <ReloadPromptInner />;
}
