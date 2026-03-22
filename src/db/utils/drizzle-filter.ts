import type { ColumnFiltersState } from "@tanstack/react-table";
import type { Column, SQL } from "drizzle-orm";
import {
	and,
	eq,
	exists,
	gt,
	gte,
	inArray,
	isNotNull,
	isNull,
	like,
	lt,
	lte,
	ne,
	notInArray,
	notLike,
	or,
	sql,
} from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import { alias } from "drizzle-orm/sqlite-core";
import { db } from "@/db";

export enum DataType {
	String = "string",
	Number = "number",
	Date = "date",
	Boolean = "boolean",
}

// ----------------------------------------------------------------------

/** Escape special LIKE characters (% and _) in user input */
const escapeValue = (v: string) => String(v).replace(/[%_]/g, "\\$&");

/** Pattern for `LIKE '%value%'` - matches anywhere in string */
export const escapeContains = (v: string) => `%${escapeValue(v)}%`;

/** Pattern for `LIKE 'value%'` - matches at start of string */
export const escapeStartsWith = (v: string) => `${escapeValue(v)}%`;

/** Pattern for `LIKE '%value'` - matches at end of string */
export const escapeEndsWith = (v: string) => `%${escapeValue(v)}`;

/** Cast column to TEXT for LIKE comparisons on non-string columns */
const castToText = (column: Column) => sql<string>`CAST(${column} AS TEXT)`;

// ----------------------------------------------------------------------
// Operator Map
// ----------------------------------------------------------------------

const operatorMap: Record<
	string,
	(column: Column, value: any) => SQL | undefined
> = {
	// String operators
	contains: (c, v) => like(c, escapeContains(v)),
	notContains: (c, v) => notLike(c, escapeContains(v)),
	startsWith: (c, v) => like(c, escapeStartsWith(v)),
	endsWith: (c, v) => like(c, escapeEndsWith(v)),

	// Comparison operators
	equals: eq,
	"=": eq,
	notEquals: ne,
	"!=": ne,
	">": gt,
	">=": gte,
	"<": lt,
	"<=": lte,

	// Collection operators
	isAnyOf: inArray,
	in: inArray,
	notIn: notInArray,

	// Null/empty operators
	isEmpty: (c) => or(isNull(c), eq(c, "")),
	isNotEmpty: (c) => and(isNotNull(c), ne(c, "")),

	// Range operator (expects array [min, max])
	between: (c, v) => {
		if (!Array.isArray(v) || v.length !== 2) return undefined;
		return and(gte(c, v[0]), lte(c, v[1]));
	},
};

const DEFAULT_OPERATOR = "contains";

// ----------------------------------------------------------------------
// Quick Filter Config Types
// ----------------------------------------------------------------------

type DirectQuickFilterField<T extends SQLiteTable> = {
	field: keyof T["_"]["columns"];
	type: DataType;
	cast?: boolean;
};

type RelatedQuickFilterField<
	T extends SQLiteTable,
	R extends SQLiteTable = SQLiteTable,
> = {
	related: R;
	/** How to link related table to main table (use columns, not strings) */
	on: (main: T, rel: R) => SQL | undefined;
	/** Conditions on related table for a given search value (OR'd together) */
	any: Array<(rel: R, value: string) => SQL | undefined>;
};

type QuickFilterField<T extends SQLiteTable> =
	| DirectQuickFilterField<T>
	| RelatedQuickFilterField<T, any>;

export type QuickFilterConfig<T extends SQLiteTable> = {
	fields: QuickFilterField<T>[];
};

export function related<T extends SQLiteTable, R extends SQLiteTable>(
	cfg: RelatedQuickFilterField<T, R>,
) {
	return cfg as QuickFilterField<T>;
}

// ----------------------------------------------------------------------
// Filter Value Normalization
// ----------------------------------------------------------------------

function normalizeFilterValue(value: unknown): {
	operator: string;
	value: any;
} {
	if (
		typeof value === "object" &&
		value !== null &&
		"operator" in value &&
		"value" in value
	) {
		return value as { operator: string; value: any };
	}
	return { operator: DEFAULT_OPERATOR, value };
}

export function buildDrizzleFilter<T extends SQLiteTable>(
	table: T,
	columnFilters: ColumnFiltersState,
	globalFilter: string | string[] | undefined,
	quickFilterConfig: QuickFilterConfig<T>,
): SQL | undefined {
	const conditions: SQL[] = [];

	if (columnFilters?.length) {
		const itemConditions = columnFilters
			.map((item) => {
				const column = (table as unknown as Record<string, Column>)[item.id];
				const { operator, value } = normalizeFilterValue(item.value);
				const operatorFn = operatorMap[operator];
				return column && operatorFn ? operatorFn(column, value) : undefined;
			})
			.filter((c): c is SQL => !!c);

		if (itemConditions.length > 0) {
			// TanStack Table uses AND for column filters by default
			conditions.push(and(...itemConditions)!);
		}
	}

	const globalFilterValues = globalFilter
		? Array.isArray(globalFilter)
			? globalFilter
			: globalFilter.trim().split(/\s+/).filter(Boolean)
		: [];

	if (globalFilterValues.length) {
		// Each search term must match at least one field (AND between terms)
		const termConditions = globalFilterValues.map((value, termIdx) => {
			const escapedPattern = escapeContains(value);

			const fieldConditions = quickFilterConfig.fields
				.map((config, fieldIdx) => {
					if ("field" in config) {
						const column = (table as unknown as Record<string, Column>)[
							config.field as string
						];
						if (!column) return undefined;

						if (config.cast) {
							return like(castToText(column), escapedPattern);
						}

						switch (config.type) {
							case DataType.String:
								return like(column, escapedPattern);
							case DataType.Number:
							case DataType.Date:
								return like(castToText(column), escapedPattern);
							case DataType.Boolean: {
								const v = value.toLowerCase();
								if (v === "true") return eq(column, true);
								if (v === "false") return eq(column, false);
								return undefined;
							}
							default:
								return undefined;
						}
					}

					// Related table search using EXISTS subquery
					if ("related" in config) {
						const relAliased = alias(
							config.related,
							`rel_${termIdx}_${fieldIdx}`,
						);

						const onCondition = config.on(table, relAliased);
						if (!onCondition) return undefined;

						const anyConds = config.any
							.map((fn) => fn(relAliased, escapedPattern))
							.filter((c): c is SQL => !!c);

						if (anyConds.length === 0) return undefined;

						const whereExpr = and(
							onCondition,
							anyConds.length === 1 ? anyConds[0] : or(...anyConds),
						);

						const subquery = db
							.select({ one: sql`1` })
							.from(relAliased as any)
							.where(whereExpr);

						return exists(subquery);
					}

					return undefined;
				})
				.filter((c): c is SQL => !!c);

			// Within a single term, match ANY field (OR)
			return fieldConditions.length > 0 ? or(...fieldConditions) : undefined;
		});

		const validTermConditions = termConditions.filter((c): c is SQL => !!c);
		if (validTermConditions.length > 0) {
			// All terms must match (AND between terms)
			conditions.push(and(...validTermConditions)!);
		}
	}

	return conditions.length > 0 ? and(...conditions) : undefined;
}
