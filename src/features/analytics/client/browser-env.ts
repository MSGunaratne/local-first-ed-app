import { createClientOnlyFn } from "@tanstack/react-start";

export const getBrowserPathname = createClientOnlyFn(
	() => window.location.pathname,
);

export const getBrowserUserAgent = createClientOnlyFn(
	() => navigator.userAgent,
);

export const getLocalStorageItem = createClientOnlyFn((key: string) =>
	window.localStorage.getItem(key),
);

export const setLocalStorageItem = createClientOnlyFn(
	(key: string, value: string) => {
		window.localStorage.setItem(key, value);
	},
);
