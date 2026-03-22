import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { Workbox } from "workbox-window";

// Update check interval: 1 hour
const UPDATE_INTERVAL_MS = 60 * 60 * 1000;

function useServiceWorker() {
	const [needRefresh, setNeedRefresh] = useState(false);
	const [offlineReady, setOfflineReady] = useState(false);

	// Use explicit any or unknown for the ref initially to avoid import issues,
	// or rely on type import if it works.
	// Since we are dynamically importing, we can't use 'typeof Workbox' effectively
	// without the value import.
	// We'll trust the type import works for the instance type.
	const wbRef = useRef<Workbox | null>(null);
	const registrationRef = useRef<ServiceWorkerRegistration | null>(null);

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
		// Only run on client
		if (
			typeof window === "undefined" ||
			!("serviceWorker" in navigator) ||
			import.meta.env.DEV
		) {
			return;
		}

		// Dynamically import Workbox to avoid SSR/build issues
		import("workbox-window").then(({ Workbox }) => {
			const wb = new Workbox("/sw.js");
			wbRef.current = wb;

			// SW installed for the first time (offline ready)
			wb.addEventListener("installed", (event) => {
				if (!event.isUpdate) {
					setOfflineReady(true);
				}
			});

			// New SW waiting to activate (update available)
			wb.addEventListener("waiting", () => {
				setNeedRefresh(true);
			});

			// SW is controlling the page
			wb.addEventListener("controlling", () => {
				// Reload the page for the new SW to take effect
				window.location.reload();
			});

			// Log registration
			wb.addEventListener("activated", (event) => {
				console.log(
					"SW activated:",
					event.isUpdate ? "updated" : "first install",
				);
			});

			// Register the SW
			wb.register().then((registration) => {
				if (registration) {
					registrationRef.current = registration;

					// Check if there's already a waiting SW
					if (registration.waiting) {
						setNeedRefresh(true);
					}

					// Set up periodic update checks (every hour)
					setInterval(() => {
						registration.update();
					}, UPDATE_INTERVAL_MS);
				}
			});
		});

		return () => {
			wbRef.current = null;
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
