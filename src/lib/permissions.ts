import { createAccessControl } from "better-auth/plugins/access";
import { adminAc, defaultStatements } from "better-auth/plugins/admin/access";
import { ReportAction, UserAction } from "src/types/permission";
import { Role } from "src/types/user";

// ----------------------------------------------------------------------

const statement = {
	...defaultStatements,
	user: Object.values(UserAction),
	report: Object.values(ReportAction),
} as const;

export const ac = createAccessControl(statement);

// ----------------------------------------------------------------------

export const superAdmin = ac.newRole({
	...adminAc.statements,
	user: [
		UserAction.VIEW,
		UserAction.CREATE,
		UserAction.UPDATE,
		UserAction.DELETE,
	],
	report: [ReportAction.VIEW, ReportAction.EXPORT],
});

export const adminRole = ac.newRole({
	...adminAc.statements,
	user: [
		UserAction.VIEW,
		UserAction.CREATE,
		UserAction.UPDATE,
		UserAction.DELETE,
	],
});

export const teacher = ac.newRole({
	user: [UserAction.VIEW, UserAction.UPDATE],
});

export const student = ac.newRole({ user: [UserAction.VIEW] });

// ----------------------------------------------------------------------

export const roles = {
	[Role.SUPER_ADMIN]: superAdmin,
	[Role.ADMIN]: adminRole,
	[Role.TEACHER]: teacher,
	[Role.STUDENT]: student,
} as const;
