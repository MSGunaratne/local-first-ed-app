/**
 * Date/time formatting utilities built on native Intl browser APIs.
 * Defaults to the current Paraglide locale.
 *
 * https://paraglidejs.com/formatting
 * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat
 * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/RelativeTimeFormat
 */

import { getLocale } from "@/paraglide/runtime";

export type DateInput = Date | string | number | null | undefined;

function toDate(input: DateInput): Date | null {
	if (input === null || input === undefined || input === "") return null;

	if (input instanceof Date) {
		return Number.isNaN(input.getTime()) ? null : input;
	}

	let val = input;
	if (typeof val === "string") {
		// SQLite CURRENT_TIMESTAMP produces space-separated strings like '2024-01-15 10:30:00'.
		// Replace space with 'T' so it parses reliably as standard ISO-8601 across all JS engines.
		if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(val)) {
			val = val.replace(" ", "T");
		}
	}

	const date = new Date(val);
	return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Checks if the given input is a valid, parseable date.
 * @example isValidDate('2022-04-17') // => true
 */
export function isValidDate(input: DateInput): boolean {
	return toDate(input) !== null;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(
	locale: string,
	options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
	const key = `${locale}|${JSON.stringify(options)}`;
	let formatter = formatterCache.get(key);
	if (!formatter) {
		formatter = new Intl.DateTimeFormat(locale, options);
		formatterCache.set(key, formatter);
	}
	return formatter;
}

const rtfCache = new Map<string, Intl.RelativeTimeFormat>();

function getRtf(locale: string): Intl.RelativeTimeFormat {
	let rtf = rtfCache.get(locale);
	if (!rtf) {
		rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
		rtfCache.set(locale, rtf);
	}
	return rtf;
}

// ----------------------------------------------------------------------

/**
 * Formats a date.
 * @example fDate('2022-04-17') // => 'Apr 17, 2022' (or localized equivalent)
 */
export function fDate(
	input: DateInput,
	options?: Intl.DateTimeFormatOptions & { locale?: string },
): string {
	const date = toDate(input);
	if (!date) return "Invalid date";

	const { locale, ...rest } = options ?? {};
	return getFormatter(locale ?? getLocale(), {
		dateStyle: "medium",
		...rest,
	}).format(date);
}

// ----------------------------------------------------------------------

/**
 * Formats a date with its time.
 * @example fDateTime('2022-04-17T15:45:00Z') // => 'Apr 17, 2022, 3:45 PM' (or localized equivalent)
 */
export function fDateTime(
	input: DateInput,
	options?: Intl.DateTimeFormatOptions & { locale?: string },
): string {
	const date = toDate(input);
	if (!date) return "Invalid date";

	const { locale, ...rest } = options ?? {};
	return getFormatter(locale ?? getLocale(), {
		dateStyle: "medium",
		timeStyle: "short",
		...rest,
	}).format(date);
}

// ----------------------------------------------------------------------

/**
 * Formats only the time portion.
 * @example fTime('2022-04-17T15:45:00Z') // => '3:45 PM' (or localized equivalent)
 */
export function fTime(
	input: DateInput,
	options?: Intl.DateTimeFormatOptions & { locale?: string },
): string {
	const date = toDate(input);
	if (!date) return "Invalid date";

	const { locale, ...rest } = options ?? {};
	return getFormatter(locale ?? getLocale(), {
		timeStyle: "short",
		...rest,
	}).format(date);
}

// ----------------------------------------------------------------------

/**
 * Formats a date relative to now (e.g. "about 1 hour ago").
 * @example fToNow(Date.now() - 3_600_000) // => '1 hour ago' (or localized equivalent)
 */
export function fToNow(
	input: DateInput,
	options?: { locale?: string },
): string {
	const date = toDate(input);
	if (!date) return "Invalid date";

	const elapsed = date.getTime() - Date.now();
	const locale = options?.locale ?? getLocale();

	const rtf = getRtf(locale);
	const absElapsed = Math.abs(elapsed);

	const seconds = Math.round(absElapsed / 1000);
	const minutes = Math.round(seconds / 60);
	const hours = Math.round(minutes / 60);
	const days = Math.round(hours / 24);
	const months = Math.round(days / 30);

	if (seconds < 60) {
		return rtf.format(Math.round(elapsed / 1000), "second");
	}
	if (minutes < 60) {
		return rtf.format(Math.round(elapsed / (1000 * 60)), "minute");
	}
	if (hours < 24) {
		return rtf.format(Math.round(elapsed / (1000 * 60 * 60)), "hour");
	}
	if (days < 30) {
		return rtf.format(Math.round(elapsed / (1000 * 60 * 60 * 24)), "day");
	}
	if (months < 12) {
		return rtf.format(
			Math.round(elapsed / (1000 * 60 * 60 * 24 * 30)),
			"month",
		);
	}
	return rtf.format(Math.round(elapsed / (1000 * 60 * 60 * 24 * 365)), "year");
}
