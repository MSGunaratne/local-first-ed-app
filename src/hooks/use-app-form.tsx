import { createFormHook } from "@tanstack/react-form";
import {
	FormDebug,
	ResetButton,
	SubmitButton,
} from "@/components/form/form-components";
import {
	Checkbox,
	ComboboxField,
	DatePicker,
	EditorField,
	FileDropzone,
	NumberField,
	PhoneInput,
	Select,
	Slider,
	Switch,
	TextArea,
	TextField,
} from "../components/form/field-components";
import { fieldContext, formContext } from "./use-form-context";

export const { useAppForm } = createFormHook({
	fieldComponents: {
		TextField,
		Select,
		TextArea,
		Checkbox,
		Switch,
		Slider,
		PhoneInput,
		NumberField,
		DatePicker,
		Combobox: ComboboxField,
		FileDropzone,
		Editor: EditorField,
	},
	formComponents: {
		SubmitButton,
		ResetButton,
		FormDebug,
	},
	fieldContext,
	formContext,
});
