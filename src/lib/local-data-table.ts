import type { DataTableQueryParams } from "@/lib/dataTableSearchSchema";

type LocalDataTableConfig<T> = {
	globalSearchFields: ReadonlyArray<keyof T & string>;
	defaultSortId?: keyof T & string;
	defaultSortDesc?: boolean;
};

function normalizeComparableValue(value: unknown): string | number | boolean {
	if (value instanceof Date) {
		return value.getTime();
	}

	if (typeof value === "boolean" || typeof value === "number") {
		return value;
	}

	return String(value ?? "").toLowerCase();
}

function localValueMatchesFilter(value: unknown, filterValue: unknown) {
	const localValue = normalizeComparableValue(value);
	const expectedValue = normalizeComparableValue(filterValue);

	if (typeof localValue === "boolean" || typeof expectedValue === "boolean") {
		return (
			localValue === expectedValue ||
			Number(localValue) === Number(expectedValue)
		);
	}

	return localValue === expectedValue;
}

function getRecordValue<T>(item: T, key: string) {
	return (item as Record<string, unknown>)[key];
}

function getSortableValue<T>(item: T, key: string) {
	const value = getRecordValue(item, key);
	if (value instanceof Date) {
		return value.getTime();
	}

	if (typeof value === "number" || typeof value === "string") {
		return value;
	}

	return "";
}

export function buildLocalDataTableResult<T>(
	items: T[],
	params: DataTableQueryParams,
	config: LocalDataTableConfig<T>,
) {
	const globalFilter = params.globalFilter.trim().toLowerCase();

	const filtered = items.filter((item) => {
		const matchesGlobalFilter =
			globalFilter.length === 0 ||
			config.globalSearchFields
				.map((field) => getRecordValue(item, field))
				.filter((value): value is string => typeof value === "string")
				.some((value) => value.toLowerCase().includes(globalFilter));

		if (!matchesGlobalFilter) {
			return false;
		}

		return params.columnFilters.every((filter) =>
			localValueMatchesFilter(getRecordValue(item, filter.id), filter.value),
		);
	});

	const sort = params.sorting[0] ?? {
		id: config.defaultSortId ?? "updatedAt",
		desc: config.defaultSortDesc ?? true,
	};
	const sorted = [...filtered].sort((a, b) => {
		const aValue = getSortableValue(a, sort.id);
		const bValue = getSortableValue(b, sort.id);

		if (aValue < bValue) {
			return sort.desc ? 1 : -1;
		}

		if (aValue > bValue) {
			return sort.desc ? -1 : 1;
		}

		return 0;
	});

	const pageIndex = params.pagination.pageIndex;
	const pageSize = params.pagination.pageSize;
	const total = sorted.length;
	const pageCount = Math.ceil(total / pageSize);
	const pageStart = pageIndex * pageSize;

	return {
		data: sorted.slice(pageStart, pageStart + pageSize),
		meta: {
			itemCount: total,
			total,
			page: pageIndex,
			limit: pageSize,
			pageCount,
			hasPreviousPage: pageIndex > 0,
			hasNextPage: pageIndex < pageCount - 1,
		},
	};
}
