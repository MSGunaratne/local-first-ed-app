import { BookOpen, LayoutDashboard, Users } from "lucide-react";

export type NavItem = {
	title: string;
	path?: string;
	icon?: React.ReactNode;
	items?: NavItem[];
};

export const navConfig: NavItem[] = [
	{
		title: "nav_dashboard",
		path: "/",
		icon: <LayoutDashboard className="h-4 w-4" />,
	},
	{
		title: "nav_users",
		path: "/users",
		icon: <Users className="h-4 w-4" />,
	},
	{
		title: "nav_lessons",
		icon: <BookOpen className="h-4 w-4" />,
		items: [
			{
				title: "nav_lessons",
				path: "/lessons",
			},
			{
				title: "nav_lessons_create",
				path: "/lessons/create",
			},
		],
	},
];
