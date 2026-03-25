// TODO: Remove this when tantsack/react-start exports types for the server entry
// @ts-ignore
import handler, { createServerEntry } from "@tanstack/react-start/server-entry";
import { paraglideMiddleware } from "./paraglide/server.js";

export default createServerEntry({
	fetch(request) {
		return paraglideMiddleware(request, () => handler.fetch(request));
	},
});
