import { createFormHook } from "@tanstack/react-form";
import {
	EditorField,
	NumberField,
	Select,
	Switch,
	TextArea,
	TextField,
} from "@/components/form/field-components";
import {
	FormDebug,
	ResetButton,
	SubmitButton,
} from "@/components/form/form-components";
import { UnsavedChangesWarning } from "@/components/form/unsaved-changes-warning";
import { fieldContext, formContext } from "./use-form-context";

const lessonFormHook = createFormHook({
	fieldComponents: {
		TextField,
		Select,
		TextArea,
		Switch,
		NumberField,
		Editor: EditorField,
	},
	formComponents: {
		SubmitButton,
		ResetButton,
		FormDebug,
		UnsavedChangesWarning,
	},
	fieldContext,
	formContext,
});

export const useLessonForm = lessonFormHook.useAppForm;
