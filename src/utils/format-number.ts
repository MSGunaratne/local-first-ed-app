/**
 * Number formatting utilities.
 *
 * Thin wrapper around `Intl.NumberFormat`. Defaults to the current Paraglide
 * locale, so call sites don't need to pass a locale unless they want to
 * override it (e.g. rendering a fixed-locale PDF/export on the server).
 *
 * https://paraglidejs.com/formatting
 * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat
 */

// Adjust this import to match your paraglideVitePlugin({ outdir }) setting
// (default is usually "./src/paraglide").
import { getLocale } from "@/paraglide/runtime";

export type InputNumberValue = number | string | null | undefined;

type NumberOptions = Intl.NumberFormatOptions & { locale?: string };
type CurrencyOptions = NumberOptions & { currency?: string };

/** Fallback currency when none is passed in. */
const DEFAULT_CURRENCY = "LKR";

/**
 * Optional: map Paraglide locale tags to more specific Intl tags if you need
 * region-specific number formatting (e.g. `en` -> `en-LK`). Leave empty to
 * use Paraglide's locale tags as-is — `Intl` is happy with bare tags like "en".
 */
const INTL_LOCALE_OVERRIDES: Record<string, string> = {
	// en: 'en-LK',
};

function resolveLocale(localeCode: string): string {
	return INTL_LOCALE_OVERRIDES[localeCode] ?? localeCode;
}

function toNumber(inputValue: InputNumberValue): number | null {
	if (inputValue === null || inputValue === undefined || inputValue === "")
		return null;
	const number = Number(inputValue);
	return Number.isNaN(number) ? null : number;
}

/**
 * `Intl.NumberFormat` instances are reusable and a little costly to construct
 * repeatedly (e.g. inside a data-grid cell renderer). Cache one per
 * locale + options combination instead of creating a new one on every call.
 */
const formatterCache = new Map<string, Intl.NumberFormat>();

function getFormatter(
	locale: string,
	options: Intl.NumberFormatOptions,
): Intl.NumberFormat {
	const key = `${locale}|${JSON.stringify(options)}`;
	let formatter = formatterCache.get(key);
	if (!formatter) {
		formatter = new Intl.NumberFormat(locale, options);
		formatterCache.set(key, formatter);
	}
	return formatter;
}

// ----------------------------------------------------------------------

/**
 * Formats a number with standard grouping (e.g. "1,234.56").
 * @example fNumber(1234.5) // => '1,234.5'
 */
export function fNumber(
	inputValue: InputNumberValue,
	options?: NumberOptions,
): string {
	const number = toNumber(inputValue);
	if (number === null) return "";

	const { locale, ...rest } = options ?? {};

	return getFormatter(resolveLocale(locale ?? getLocale()), {
		minimumFractionDigits: 0,
		maximumFractionDigits: 2,
		...rest,
	}).format(number);
}

// ----------------------------------------------------------------------

/**
 * Formats a number as currency (e.g. "$1,234.56").
 * @example fCurrency(1234.5) // => '$1,234.50'
 * @example fCurrency(1234.5, { currency: 'LKR' }) // => 'LKR 1,234.50'
 */
export function fCurrency(
	inputValue: InputNumberValue,
	options?: CurrencyOptions,
): string {
	const number = toNumber(inputValue);
	if (number === null) return "";

	const { locale, currency = DEFAULT_CURRENCY, ...rest } = options ?? {};

	return getFormatter(resolveLocale(locale ?? getLocale()), {
		style: "currency",
		currency,
		...rest,
	}).format(number);
}

// ----------------------------------------------------------------------

/**
 * Formats a number as a percentage. Input is 0-100, not 0-1.
 * @example fPercent(25) // => '25%'
 */
export function fPercent(
	inputValue: InputNumberValue,
	options?: NumberOptions,
): string {
	const number = toNumber(inputValue);
	if (number === null) return "";

	const { locale, ...rest } = options ?? {};

	return getFormatter(resolveLocale(locale ?? getLocale()), {
		style: "percent",
		minimumFractionDigits: 0,
		maximumFractionDigits: 1,
		...rest,
	}).format(number / 100);
}

// ----------------------------------------------------------------------

/**
 * Shortens a large number using compact notation (e.g. "1.2k").
 * @example fShortenNumber(1234) // => '1.2k'
 */
export function fShortenNumber(
	inputValue: InputNumberValue,
	options?: NumberOptions,
): string {
	const number = toNumber(inputValue);
	if (number === null) return "";

	const { locale, ...rest } = options ?? {};

	const formatted = getFormatter(resolveLocale(locale ?? getLocale()), {
		notation: "compact",
		maximumFractionDigits: 2,
		...rest,
	}).format(number);

	return formatted.replace(/[A-Z]/g, (match) => match.toLowerCase());
}

// ----------------------------------------------------------------------

const DATA_UNITS = [
	"byte",
	"kilobyte",
	"megabyte",
	"gigabyte",
	"terabyte",
	"petabyte",
] as const;

/**
 * Formats a number as a human-readable data size (e.g. "1.25 kB").
 * Uses native Intl.NumberFormat style: "unit" for correct localized formatting.
 * @example fData(1024) // => '1 kB'
 */
export function fData(
	inputValue: InputNumberValue,
	options?: NumberOptions,
): string {
	const number = toNumber(inputValue);
	if (number === null || number === 0) {
		return getFormatter(resolveLocale(options?.locale ?? getLocale()), {
			style: "unit",
			unit: "byte",
			unitDisplay: "short",
		}).format(0);
	}

	const baseValue = 1024;
	const index = Math.min(
		Math.floor(Math.log(number) / Math.log(baseValue)),
		DATA_UNITS.length - 1,
	);

	const value = number / baseValue ** index;
	const unit = DATA_UNITS[index];

	const { locale, ...rest } = options ?? {};
	return getFormatter(resolveLocale(locale ?? getLocale()), {
		style: "unit",
		unit,
		unitDisplay: "short",
		minimumFractionDigits: 0,
		maximumFractionDigits: 2,
		...rest,
	}).format(value);
}
