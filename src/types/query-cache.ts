export const PERSISTED_QUERY_SCOPES = [
	"lessons",
	"classes",
	"users",
	"students",
	"auth",
] as const;

export type PersistedQueryScope = (typeof PERSISTED_QUERY_SCOPES)[number];

export function isPersistedQueryScope(
	scope: string,
): scope is PersistedQueryScope {
	return PERSISTED_QUERY_SCOPES.some((candidate) => candidate === scope);
}
