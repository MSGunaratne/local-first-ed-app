import { adminClient, inferAdditionalFields } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import type { auth } from "src/lib/auth";
import { ac, roles } from "src/lib/permissions";

export const authClient = createAuthClient({
	plugins: [inferAdditionalFields<typeof auth>(), adminClient({ ac, roles })],
});

export type Session = typeof authClient.$Infer.Session;
