import { z } from "zod";

export type SyncCursor = {
	updatedAt: string;
	id: string;
};

const syncCursorSchema = z.object({
	updatedAt: z.string(),
	id: z.string(),
});

export function parseSyncCursor(
	raw: string | null | undefined,
): SyncCursor | null {
	if (!raw) {
		return null;
	}

	try {
		return syncCursorSchema.parse(JSON.parse(raw));
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
