import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFormContext } from "@/hooks/use-form-context";
import { m } from "@/paraglide/messages";

export function SubmitButton({
	label = m.common_submit(),
	...props
}: { label?: string } & React.ComponentProps<typeof Button>) {
	const form = useFormContext();
	return (
		<form.Subscribe selector={(state) => [state.isSubmitting]}>
			{([isSubmitting]) => (
				<Button type="submit" disabled={isSubmitting} {...props}>
					{isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
					{label}
				</Button>
			)}
		</form.Subscribe>
	);
}

export function ResetButton({
	label = m.common_reset(),
	...props
}: { label?: string } & React.ComponentProps<typeof Button>) {
	const form = useFormContext();
	return (
		<form.Subscribe selector={(state) => [state.isDirty, state.isSubmitting]}>
			{([isDirty, isSubmitting]) => (
				<Button
					type="button"
					variant="outline"
					disabled={!isDirty || isSubmitting}
					onClick={() => form.reset()}
					{...props}
				>
					{label}
				</Button>
			)}
		</form.Subscribe>
	);
}

export function FormDebug() {
	const form = useFormContext();
	return (
		<form.Subscribe
			selector={(state) => ({
				values: state.values,
				errors: state.errors,
				isSubmitting: state.isSubmitting,
				isDirty: state.isDirty,
				isValid: state.isValid,
			})}
		>
			{(state) => (
				<div className="mt-8 p-4 rounded-md bg-slate-950 text-slate-50 text-xs overflow-auto max-h-[400px] font-mono">
					<h4 className="font-bold mb-2 uppercase tracking-wider text-slate-400 border-b border-slate-800 pb-1">
						Form Debugger
					</h4>
					<div className="grid gap-4">
						<div>
							<div className="text-slate-400 mb-1">Status</div>
							<div className="flex gap-2">
								<span
									className={state.isValid ? "text-green-400" : "text-red-400"}
								>
									Valid: {String(state.isValid)}
								</span>
								<span
									className={
										state.isDirty ? "text-yellow-400" : "text-slate-500"
									}
								>
									Dirty: {String(state.isDirty)}
								</span>
								<span
									className={
										state.isSubmitting ? "text-blue-400" : "text-slate-500"
									}
								>
									Submitting: {String(state.isSubmitting)}
								</span>
							</div>
						</div>
						<div>
							<div className="text-slate-400 mb-1">Errors</div>
							<pre className="bg-slate-900 p-2 rounded">
								{JSON.stringify(state.errors, null, 2)}
							</pre>
						</div>
						<div>
							<div className="text-slate-400 mb-1">Values</div>
							<pre className="bg-slate-900 p-2 rounded">
								{JSON.stringify(state.values, null, 2)}
							</pre>
						</div>
					</div>
				</div>
			)}
		</form.Subscribe>
	);
}

//Extra components you can build using the useFormContext pattern:

// <form.AutoSave />:
// Idea: Watches state.values and triggers a debounced save to localStorage or a draft API endpoint.
// Use Case: Prevent data loss for long layouts or blog posts.
// <form.UnsavedChangesWarning />:
// Idea: Uses state.isDirty and the useBlocker hook (from TanStack Router) or window.onbeforeunload.
// Use Case: Warns users if they try to navigate away/close the tab with unsaved changes.
// <form.FieldWatcher name="role" />:
// Idea: A component that conditionally renders its children only when a specific field matches a value.
// Use Case: "Show School Name input only if Role is Teacher".
