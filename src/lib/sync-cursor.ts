export type SyncCursor = {
	updatedAt: string;
	id: string;
};

export function parseSyncCursor(
	raw: string | null | undefined,
): SyncCursor | null {
	if (!raw) {
		return null;
	}

	try {
		const parsed = JSON.parse(raw) as Partial<SyncCursor>;
		if (typeof parsed.updatedAt === "string" && typeof parsed.id === "string") {
			return { updatedAt: parsed.updatedAt, id: parsed.id };
		}
	} catch {
		const date = new Date(raw);
		if (!Number.isNaN(date.getTime())) {
			return { updatedAt: date.toISOString(), id: "" };
		}
	}

	return null;
}

export function serializeSyncCursor(
	row: { id: string; updatedAt: Date } | undefined,
): SyncCursor | null {
	if (!row) {
		return null;
	}

	return {
		updatedAt: row.updatedAt.toISOString(),
		id: row.id,
	};
}
