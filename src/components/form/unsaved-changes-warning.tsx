import { useStore } from "@tanstack/react-form";
import { useBlocker } from "@tanstack/react-router";
import { useEffect } from "react";
import { useFormContext } from "@/hooks/use-form-context";
import { m } from "@/paraglide/messages";

export function UnsavedChangesWarning() {
	const form = useFormContext();

	const isDirty = useStore(form.store, (s) => s.isDirty);
	const isSubmitting = useStore(form.store, (s) => s.isSubmitting);

	const shouldBlock = isDirty && !isSubmitting;

	useBlocker({
		shouldBlockFn: () => {
			if (!shouldBlock) return false;
			return !window.confirm(m.form_unsaved_changes_warning());
		},
	});

	// Handle the case where the user tries to close the tab or refresh
	useEffect(() => {
		const handleBeforeUnload = (e: BeforeUnloadEvent) => {
			if (shouldBlock) {
				e.preventDefault();
			}
		};

		window.addEventListener("beforeunload", handleBeforeUnload);
		return () => window.removeEventListener("beforeunload", handleBeforeUnload);
	}, [shouldBlock]);

	return null;
}
