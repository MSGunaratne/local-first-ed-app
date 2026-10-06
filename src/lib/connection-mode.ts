import { environmentManager, onlineManager } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";

export type ConnectionMode = "auto" | "online" | "offline";

const CONNECTION_MODE_STORAGE_KEY = "local-first-ed-app:connection-mode";
const CONNECTION_MODE_EVENT = "connection-mode-change";

let connectionModeInitialized = false;

function getStoredConnectionMode(): ConnectionMode {
	if (environmentManager.isServer()) {
		return "auto";
	}

	const storedMode = window.localStorage.getItem(CONNECTION_MODE_STORAGE_KEY);
	if (
		storedMode === "online" ||
		storedMode === "offline" ||
		storedMode === "auto"
	) {
		return storedMode;
	}

	return "auto";
}

function getEffectiveOnlineState(mode = getStoredConnectionMode()) {
	const physicallyOnline =
		typeof navigator === "undefined" ? true : navigator.onLine !== false;

	if (mode === "online") {
		return physicallyOnline;
	}

	if (mode === "offline") {
		return false;
	}

	return physicallyOnline;
}

function getSnapshot() {
	const mode = getStoredConnectionMode();
	return `${mode}:${getEffectiveOnlineState(mode)}`;
}

function emitConnectionModeChange() {
	if (environmentManager.isServer()) {
		return;
	}

	window.dispatchEvent(new Event(CONNECTION_MODE_EVENT));
}

export function initializeConnectionMode() {
	if (environmentManager.isServer() || connectionModeInitialized) {
		return;
	}

	connectionModeInitialized = true;

	// When mode is "auto", delegate to browser online/offline events.
	// When forced, override with the selected state.
	onlineManager.setEventListener((setOnline) => {
		const syncOnlineState = () => {
			setOnline(getEffectiveOnlineState());
		};

		window.addEventListener("online", syncOnlineState);
		window.addEventListener("offline", syncOnlineState);
		window.addEventListener("storage", syncOnlineState);
		window.addEventListener(CONNECTION_MODE_EVENT, syncOnlineState);

		syncOnlineState();

		return () => {
			window.removeEventListener("online", syncOnlineState);
			window.removeEventListener("offline", syncOnlineState);
			window.removeEventListener("storage", syncOnlineState);
			window.removeEventListener(CONNECTION_MODE_EVENT, syncOnlineState);
		};
	});
}

export function setConnectionMode(mode: ConnectionMode) {
	if (environmentManager.isServer()) {
		return;
	}

	window.localStorage.setItem(CONNECTION_MODE_STORAGE_KEY, mode);
	onlineManager.setOnline(getEffectiveOnlineState(mode));
	emitConnectionModeChange();
}

export function cycleConnectionMode() {
	const currentMode = getStoredConnectionMode();
	const nextMode: ConnectionMode =
		currentMode === "auto"
			? "offline"
			: currentMode === "offline"
				? "online"
				: "auto";

	setConnectionMode(nextMode);
}

export function useConnectionMode() {
	const snapshot = useSyncExternalStore(
		(subscribe) => {
			if (environmentManager.isServer()) {
				return () => undefined;
			}

			const listener = () => subscribe();
			window.addEventListener("online", listener);
			window.addEventListener("offline", listener);
			window.addEventListener("storage", listener);
			window.addEventListener(CONNECTION_MODE_EVENT, listener);

			return () => {
				window.removeEventListener("online", listener);
				window.removeEventListener("offline", listener);
				window.removeEventListener("storage", listener);
				window.removeEventListener(CONNECTION_MODE_EVENT, listener);
			};
		},
		getSnapshot,
		() => "auto:true",
	);

	const [mode, onlineState] = snapshot.split(":") as [ConnectionMode, string];

	return {
		mode,
		isOnline: onlineState === "true",
		isForced: mode !== "auto",
	};
}
