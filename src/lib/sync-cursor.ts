export function parseSyncCursor(raw: string | null | undefined): number | null {
	if (!raw) return null;
	const revision = Number(raw);
	return Number.isSafeInteger(revision) && revision >= 0 ? revision : null;
}

export function serializeSyncCursor(
	revision: number | undefined,
): string | null {
	if (!Number.isSafeInteger(revision) || (revision ?? -1) < 0) return null;
	return String(revision);
}
