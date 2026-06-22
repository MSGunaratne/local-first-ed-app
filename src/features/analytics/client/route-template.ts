export function toRouteTemplate(pathname: string): string {
	const noTrailing = pathname.replace(/\/+$/, "") || "/";
	return noTrailing
		.replace(/\b\d{3,}\b/g, ":id")
		.replace(
			/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi,
			":id",
		);
}
