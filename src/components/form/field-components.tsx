import { useSelector } from "@tanstack/react-store";
import type { JSONContent } from "@tiptap/core";
import { CalendarIcon } from "lucide-react";
import { lazy, Suspense } from "react";
import type * as React from "react";
import type { DropzoneOptions } from "react-dropzone";
import PhoneInputWithCountry from "react-phone-number-input/input";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox as ShadcnCheckbox } from "@/components/ui/checkbox";
import {
	Combobox,
	ComboboxContent,
	ComboboxEmpty,
	ComboboxInput,
	ComboboxItem,
	ComboboxList,
} from "@/components/ui/combobox";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldLabel,
} from "@/components/ui/field";
import { FileUploader } from "@/components/ui/file-upload";
import { Input } from "@/components/ui/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import * as ShadcnSelect from "@/components/ui/select";
import { Slider as ShadcnSlider } from "@/components/ui/slider";
import { Switch as ShadcnSwitch } from "@/components/ui/switch";
import { Textarea as ShadcnTextarea } from "@/components/ui/textarea";
import { useFieldContext } from "@/hooks/use-form-context";
import { cn } from "@/lib/utils";
import { fDate } from "@/utils/format-time";

const LazyEditor = lazy(() =>
	import("@/components/ui/editor").then((module) => ({
		default: module.Editor,
	})),
);

// ----------------------------------------------------------------------
// Helper for displaying errors
// ----------------------------------------------------------------------
function FieldErrorList({
	errors,
}: {
	errors: Array<string | { message: string } | undefined | null>;
}) {
	if (!errors.length) return null;
	const formattedErrors = errors.flatMap((e) => {
		if (typeof e === "string") {
			return [{ message: e }];
		}
		if (e != null) {
			return [e];
		}
		return [];
	});
	return <FieldError errors={formattedErrors} />;
}

// ----------------------------------------------------------------------
// 1. Text Field (Text, Email, Password, Number)
// ----------------------------------------------------------------------
interface TextFieldProps {
	label?: string;
	placeholder?: string;
	description?: string;
	type?: "text" | "email" | "password" | "number";
	className?: string;
	required?: boolean;
}

export function TextField({
	label,
	placeholder,
	description,
	type = "text",
	className,
	required,
}: TextFieldProps) {
	const field = useFieldContext<string | number>();
	const { errors, isTouched } = useSelector(field.store, (state) => ({
		errors: state.meta.errors,
		isTouched: state.meta.isTouched,
	}));
	const isInvalid = isTouched && errors.length > 0;

	return (
		<Field className={className} data-invalid={isInvalid}>
			{label && (
				<FieldLabel htmlFor={field.name}>
					{label}
					{required && <span className="text-destructive ml-1">*</span>}
				</FieldLabel>
			)}
			<Input
				id={field.name}
				name={field.name}
				required={required}
				type={type}
				value={field.state.value ?? ""}
				onBlur={field.handleBlur}
				onChange={(e) => {
					// Handle number input conversion
					if (type === "number") {
						const val = e.target.value;
						field.handleChange(val === "" ? "" : Number(val));
					} else {
						field.handleChange(e.target.value);
					}
				}}
				placeholder={placeholder}
				aria-invalid={isInvalid}
			/>
			{description && <FieldDescription>{description}</FieldDescription>}
			{isInvalid && <FieldErrorList errors={errors} />}
		</Field>
	);
}

// ----------------------------------------------------------------------
// 2. Text Area
// ----------------------------------------------------------------------
interface TextAreaProps {
	label?: string;
	placeholder?: string;
	description?: string;
	rows?: number;
	className?: string;
	required?: boolean;
}

export function TextArea({
	label,
	placeholder,
	description,
	rows = 3,
	className,
	required,
}: TextAreaProps) {
	const field = useFieldContext<string>();
	const { errors, isTouched } = useSelector(field.store, (state) => ({
		errors: state.meta.errors,
		isTouched: state.meta.isTouched,
	}));
	const isInvalid = isTouched && errors.length > 0;

	return (
		<Field className={className} data-invalid={isInvalid}>
			{label && (
				<FieldLabel htmlFor={field.name}>
					{label}
					{required && <span className="text-destructive ml-1">*</span>}
				</FieldLabel>
			)}
			<ShadcnTextarea
				id={field.name}
				name={field.name}
				required={required}
				value={field.state.value ?? ""}
				onBlur={field.handleBlur}
				onChange={(e) => field.handleChange(e.target.value)}
				placeholder={placeholder}
				rows={rows}
				aria-invalid={isInvalid}
			/>
			{description && <FieldDescription>{description}</FieldDescription>}
			{isInvalid && <FieldErrorList errors={errors} />}
		</Field>
	);
}

// ----------------------------------------------------------------------
// 3. Select
// ----------------------------------------------------------------------
interface SelectProps {
	label?: string;
	placeholder?: string;
	description?: string;
	options: Array<{ label: string; value: string }>;
	className?: string;
	required?: boolean;
}

export function Select({
	label,
	options,
	placeholder,
	description,
	className,
	required,
}: SelectProps) {
	const field = useFieldContext<string>();
	const { errors, isTouched } = useSelector(field.store, (state) => ({
		errors: state.meta.errors,
		isTouched: state.meta.isTouched,
	}));
	const isInvalid = isTouched && errors.length > 0;

	return (
		<Field className={className} data-invalid={isInvalid}>
			{label && (
				<FieldLabel>
					{label}
					{required && <span className="text-destructive ml-1">*</span>}
				</FieldLabel>
			)}
			<ShadcnSelect.Select
				name={field.name}
				required={required}
				value={field.state.value ?? ""}
				onValueChange={(value) => field.handleChange(value)}
			>
				<ShadcnSelect.SelectTrigger id={field.name} className="w-full">
					<ShadcnSelect.SelectValue placeholder={placeholder} />
				</ShadcnSelect.SelectTrigger>
				<ShadcnSelect.SelectContent>
					{options.map((option) => (
						<ShadcnSelect.SelectItem key={option.value} value={option.value}>
							{option.label}
						</ShadcnSelect.SelectItem>
					))}
				</ShadcnSelect.SelectContent>
			</ShadcnSelect.Select>
			{description && <FieldDescription>{description}</FieldDescription>}
			{isInvalid && <FieldErrorList errors={errors} />}
		</Field>
	);
}

// ----------------------------------------------------------------------
// 4. Switch (Single)
// ----------------------------------------------------------------------
interface SwitchProps {
	label: string; // Label is usually required for a switch for accessibility
	description?: string;
	className?: string;
}

export function Switch({ label, description, className }: SwitchProps) {
	const field = useFieldContext<boolean>();
	const { errors, isTouched } = useSelector(field.store, (state) => ({
		errors: state.meta.errors,
		isTouched: state.meta.isTouched,
	}));
	const isInvalid = isTouched && errors.length > 0;

	return (
		<Field className={className} data-invalid={isInvalid}>
			<div className="flex items-center gap-2">
				<ShadcnSwitch
					id={field.name}
					checked={field.state.value}
					onCheckedChange={(checked) => field.handleChange(checked)}
					onBlur={field.handleBlur}
				/>
				<FieldLabel htmlFor={field.name} className="m-0">
					{label}
				</FieldLabel>
			</div>
			{description && <FieldDescription>{description}</FieldDescription>}
			{isInvalid && <FieldErrorList errors={errors} />}
		</Field>
	);
}

// ----------------------------------------------------------------------
// 5. Checkbox (Single)
// ----------------------------------------------------------------------
interface CheckboxProps {
	label: string;
	description?: string;
	className?: string;
}

export function Checkbox({ label, description, className }: CheckboxProps) {
	const field = useFieldContext<boolean>();
	const { errors, isTouched } = useSelector(field.store, (state) => ({
		errors: state.meta.errors,
		isTouched: state.meta.isTouched,
	}));
	const isInvalid = isTouched && errors.length > 0;

	return (
		<Field className={className} data-invalid={isInvalid}>
			<div className="flex items-center gap-2">
				<ShadcnCheckbox
					id={field.name}
					checked={field.state.value}
					onCheckedChange={(checked) =>
						field.handleChange(checked === "indeterminate" ? false : checked)
					}
					onBlur={field.handleBlur}
				/>
				<FieldLabel htmlFor={field.name} className="m-0">
					{label}
				</FieldLabel>
			</div>
			{description && <FieldDescription>{description}</FieldDescription>}
			{isInvalid && <FieldErrorList errors={errors} />}
		</Field>
	);
}

// ----------------------------------------------------------------------
// 6. Slider
// ----------------------------------------------------------------------
interface SliderProps {
	label?: string;
	description?: string;
	min?: number;
	max?: number;
	step?: number;
	className?: string;
	required?: boolean;
}

export function Slider({
	label,
	description,
	min = 0,
	max = 100,
	step = 1,
	className,
	required,
}: SliderProps) {
	const field = useFieldContext<number>();
	const { errors, isTouched } = useSelector(field.store, (state) => ({
		errors: state.meta.errors,
		isTouched: state.meta.isTouched,
	}));
	const isInvalid = isTouched && errors.length > 0;

	return (
		<Field className={className} data-invalid={isInvalid}>
			{label && (
				<FieldLabel htmlFor={field.name}>
					{label}
					{required && <span className="text-destructive ml-1">*</span>}
				</FieldLabel>
			)}
			<ShadcnSlider
				id={field.name}
				value={[field.state.value ?? min]}
				min={min}
				max={max}
				step={step}
				onValueChange={(value) => field.handleChange(value[0])}
				onBlur={field.handleBlur}
			/>
			{description && <FieldDescription>{description}</FieldDescription>}
			{isInvalid && <FieldErrorList errors={errors} />}
		</Field>
	);
}

// ----------------------------------------------------------------------
// 7. Phone Input
// ----------------------------------------------------------------------
interface PhoneInputProps {
	label?: string;
	placeholder?: string;
	description?: string;
	className?: string;
	required?: boolean;
}

export function PhoneInput({
	label,
	placeholder,
	description,
	className,
	required,
}: PhoneInputProps) {
	const field = useFieldContext<string>();
	const { errors, isTouched } = useSelector(field.store, (state) => ({
		errors: state.meta.errors,
		isTouched: state.meta.isTouched,
	}));
	const isInvalid = isTouched && errors.length > 0;

	return (
		<Field className={className} data-invalid={isInvalid}>
			{label && (
				<FieldLabel htmlFor={field.name}>
					{label}
					{required && <span className="text-destructive ml-1">*</span>}
				</FieldLabel>
			)}
			{/* Wrapper to add Shadcn Input styles to the raw generic input */}
			<div className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
				<PhoneInputWithCountry
					name={field.name}
					value={field.state.value ?? ""}
					onChange={(value) => field.handleChange(value ?? "")}
					onBlur={field.handleBlur}
					placeholder={placeholder}
					className="flex-1 bg-transparent outline-none border-none p-0 placeholder:text-muted-foreground"
				/>
			</div>
			{description && <FieldDescription>{description}</FieldDescription>}
			{isInvalid && <FieldErrorList errors={errors} />}
		</Field>
	);
}

// ----------------------------------------------------------------------
// 8. Number Field
// ----------------------------------------------------------------------
interface NumberFieldProps extends Omit<TextFieldProps, "type"> {
	min?: number;
	max?: number;
	step?: number;
}

export function NumberField({
	label,
	placeholder,
	description,
	className,
	min,
	max,
	step,
	...props
}: NumberFieldProps) {
	const field = useFieldContext<number>();
	const { errors, isTouched } = useSelector(field.store, (state) => ({
		errors: state.meta.errors,
		isTouched: state.meta.isTouched,
	}));
	const isInvalid = isTouched && errors.length > 0;

	return (
		<Field className={className} data-invalid={isInvalid}>
			{label && (
				<FieldLabel htmlFor={field.name}>
					{label}
					{props.required && <span className="text-destructive ml-1">*</span>}
				</FieldLabel>
			)}
			<Input
				id={field.name}
				name={field.name}
				type="number"
				value={field.state.value ?? ""}
				onBlur={field.handleBlur}
				onChange={(e) => {
					const val = e.target.value;
					field.handleChange((val === "" ? undefined : Number(val)) as number);
				}}
				placeholder={placeholder}
				min={min}
				max={max}
				step={step}
				aria-invalid={isInvalid}
				{...props}
			/>
			{description && <FieldDescription>{description}</FieldDescription>}
			{isInvalid && <FieldErrorList errors={errors} />}
		</Field>
	);
}

// ----------------------------------------------------------------------
// 9. Date Picker
// ----------------------------------------------------------------------
interface DatePickerProps {
	label?: string;
	placeholder?: string;
	description?: string;
	className?: string;
	required?: boolean;
	slotProps?: {
		popover?: React.ComponentProps<typeof PopoverContent>;
		calendar?: React.ComponentProps<typeof Calendar>;
		trigger?: React.ComponentProps<typeof Button>;
	};
}

function FieldControlFallback({ className }: { className?: string }) {
	return (
		<div
			className={cn(
				"min-h-[150px] w-full rounded-md border border-input bg-muted/20 animate-pulse",
				className,
			)}
		/>
	);
}

export function DatePicker({
	label,
	placeholder = "Pick a date",
	description,
	className,
	required,
	slotProps,
}: DatePickerProps) {
	const field = useFieldContext<Date>();
	const { errors, isTouched } = useSelector(field.store, (state) => ({
		errors: state.meta.errors,
		isTouched: state.meta.isTouched,
	}));
	const isInvalid = isTouched && errors.length > 0;

	return (
		<Field className={className} data-invalid={isInvalid}>
			{label && (
				<FieldLabel htmlFor={field.name}>
					{label}
					{required && <span className="text-destructive ml-1">*</span>}
				</FieldLabel>
			)}
			<Popover>
				<PopoverTrigger asChild>
					<Button
						variant={"outline"}
						className={cn(
							"w-full justify-start text-left font-normal",
							!field.state.value && "text-muted-foreground",
							slotProps?.trigger?.className,
						)}
						{...slotProps?.trigger}
					>
						<CalendarIcon className="mr-2 h-4 w-4" />
						{field.state.value ? (
							fDate(field.state.value, { dateStyle: "long" })
						) : (
							<span>{placeholder}</span>
						)}
					</Button>
				</PopoverTrigger>
				<PopoverContent
					className="w-auto p-0"
					align="start"
					{...slotProps?.popover}
				>
					<Calendar
						autoFocus
						{...slotProps?.calendar}
						mode="single"
						selected={field.state.value}
						onSelect={(date) => field.handleChange(date as Date)}
					/>
				</PopoverContent>
			</Popover>
			{description && <FieldDescription>{description}</FieldDescription>}
			{isInvalid && <FieldErrorList errors={errors} />}
		</Field>
	);
}

// ----------------------------------------------------------------------
// 10. Combobox (Autocomplete)
// ----------------------------------------------------------------------
interface ComboboxProps<T> {
	label?: string;
	placeholder?: string;
	description?: string;
	options: Array<{ label: string; value: T }>;
	className?: string;
	required?: boolean;
	slotProps?: {
		root?: React.ComponentProps<typeof Combobox>;
		input?: React.ComponentProps<typeof ComboboxInput>;
		content?: React.ComponentProps<typeof ComboboxContent>;
		list?: React.ComponentProps<typeof ComboboxList>;
		item?: React.ComponentProps<typeof ComboboxItem>;
	};
}

export function ComboboxField<T extends string | number>({
	label,
	options,
	placeholder = "Select option...",
	description,
	className,
	required,
	slotProps,
}: ComboboxProps<T>) {
	const field = useFieldContext<T>();
	const { errors, isTouched } = useSelector(field.store, (state) => ({
		errors: state.meta.errors,
		isTouched: state.meta.isTouched,
	}));
	const isInvalid = isTouched && errors.length > 0;

	return (
		<Field className={className} data-invalid={isInvalid}>
			{label && (
				<FieldLabel>
					{label}
					{required && <span className="text-destructive ml-1">*</span>}
				</FieldLabel>
			)}
			<Combobox
				value={field.state.value}
				onValueChange={(val) => field.handleChange(val as T)}
				{...slotProps?.root}
			>
				<ComboboxInput placeholder={placeholder} {...slotProps?.input} />
				<ComboboxContent {...slotProps?.content}>
					<ComboboxList {...slotProps?.list}>
						<ComboboxEmpty>No results found.</ComboboxEmpty>
						{options.map((option) => (
							<ComboboxItem
								key={String(option.value)}
								value={String(option.value)}
								{...slotProps?.item}
							>
								{option.label}
							</ComboboxItem>
						))}
					</ComboboxList>
				</ComboboxContent>
			</Combobox>
			{description && <FieldDescription>{description}</FieldDescription>}
			{isInvalid && <FieldErrorList errors={errors} />}
		</Field>
	);
}

// ----------------------------------------------------------------------
// 11. File Dropzone
// ----------------------------------------------------------------------
interface FileDropzoneProps {
	label?: string;
	description?: string;
	dropzoneOptions?: DropzoneOptions;
	className?: string;
	required?: boolean;
}

export function FileDropzone({
	label,
	description,
	dropzoneOptions,
	className,
	required,
}: FileDropzoneProps) {
	const field = useFieldContext<File[]>();
	const { errors, isTouched } = useSelector(field.store, (state) => ({
		errors: state.meta.errors,
		isTouched: state.meta.isTouched,
	}));
	const isInvalid = isTouched && errors.length > 0;

	return (
		<Field className={className} data-invalid={isInvalid}>
			{label && (
				<FieldLabel htmlFor={field.name}>
					{label}
					{required && <span className="text-destructive ml-1">*</span>}
				</FieldLabel>
			)}
			<FileUploader
				value={field.state.value}
				onValueChange={field.handleChange}
				dropzoneOptions={dropzoneOptions}
				description={description}
			/>
			{isInvalid && <FieldErrorList errors={errors} />}
		</Field>
	);
}

// ----------------------------------------------------------------------
// 12. Rich Text Editor (TipTap)
// ----------------------------------------------------------------------

interface EditorFieldProps {
	label?: string;
	description?: string;
	className?: string;
	placeholder?: string;
	required?: boolean;
}

export function EditorField({
	label,
	description,
	className,
	placeholder,
	required,
}: EditorFieldProps) {
	const field = useFieldContext<JSONContent | null>();
	const { errors, isTouched } = useSelector(field.store, (state) => ({
		errors: state.meta.errors,
		isTouched: state.meta.isTouched,
	}));
	const isInvalid = isTouched && errors.length > 0;

	return (
		<Field className={className} data-invalid={isInvalid}>
			{label && (
				<FieldLabel htmlFor={field.name}>
					{label}
					{required && <span className="text-destructive ml-1">*</span>}
				</FieldLabel>
			)}
			<div className="w-full">
				<Suspense
					fallback={
						<FieldControlFallback
							className={cn(
								"min-h-[220px]",
								isInvalid && "border-destructive ring-destructive/50",
							)}
						/>
					}
				>
					<LazyEditor
						value={field.state.value}
						onChange={(json, _html) => {
							field.handleChange(json);
						}}
						placeholder={placeholder}
						className={cn(isInvalid && "border-destructive ring-destructive/50")}
					/>
				</Suspense>
			</div>
			{description && <FieldDescription>{description}</FieldDescription>}
			{isInvalid && <FieldErrorList errors={errors} />}
		</Field>
	);
}
