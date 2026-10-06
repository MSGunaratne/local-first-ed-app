import { createFormHook } from "@tanstack/react-form";
import { PhoneInput, TextField } from "@/components/form/field-components";
import {
	FormDebug,
	ResetButton,
	SubmitButton,
} from "@/components/form/form-components";
import { UnsavedChangesWarning } from "@/components/form/unsaved-changes-warning";
import { fieldContext, formContext } from "./use-form-context";

const userFormHook = createFormHook({
	fieldComponents: { TextField, PhoneInput },
	formComponents: {
		SubmitButton,
		ResetButton,
		FormDebug,
		UnsavedChangesWarning,
	},
	fieldContext,
	formContext,
});

export const useUserForm = userFormHook.useAppForm;
