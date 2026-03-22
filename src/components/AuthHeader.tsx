import { Link } from "@tanstack/react-router";
import { m } from "@/paraglide/messages";
import ParaglideLocaleSwitcher from "./LocaleSwitcher.tsx";

export default function AuthHeader() {
	return (
		<header className="p-4 flex items-center justify-between bg-gray-800 text-white shadow-lg">
			<h1 className="text-xl font-semibold">
				<Link to="/">
					<img
						src="/iit-logo.webp"
						alt={m.common_app_title()}
						className="h-10"
					/>
				</Link>
			</h1>
			<ParaglideLocaleSwitcher
				isCollapsed={true}
				className="text-white hover:bg-gray-700 hover:text-white"
			/>
		</header>
	);
}
