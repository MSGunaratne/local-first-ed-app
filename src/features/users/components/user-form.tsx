import { useMutation } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAppForm } from "@/hooks/use-app-form";
import { m } from "@/paraglide/messages";
import { userMutations } from "../users.queries";
import {
	type UserCreateInput,
	type UserUpdateInput,
	userCreateClientSchema,
	userUpdateClientSchema,
} from "../users.schema";
import type { UserDetails } from "../users.service";

// ----------------------------------------------------------------------

function UserFormLayout({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<div className="space-y-4">
			<Breadcrumb>
				<BreadcrumbList>
					<BreadcrumbItem>
						<BreadcrumbLink asChild>
							<Link to="/users">{m.users_breadcrumb()}</Link>
						</BreadcrumbLink>
					</BreadcrumbItem>
					<BreadcrumbSeparator />
					<BreadcrumbItem>
						<BreadcrumbPage>{title}</BreadcrumbPage>
					</BreadcrumbItem>
				</BreadcrumbList>
			</Breadcrumb>

			<div className="mx-auto max-w-2xl">
				<Card>
					<CardHeader>
						<CardTitle className="text-lg">
							{m.lessons_card_details()}
						</CardTitle>
					</CardHeader>
					<CardContent>{children}</CardContent>
				</Card>
			</div>
		</div>
	);
}

// ----------------------------------------------------------------------

export function UserCreateForm() {
	const navigate = useNavigate();
	const { mutate } = useMutation(userMutations.create());

	const defaultValues: UserCreateInput = {
		name: "",
		email: "",
		password: "",
		phoneNumber: "",
		image: null,
	};

	const form = useAppForm({
		defaultValues,
		validators: {
			onSubmit: userCreateClientSchema,
		},
		onSubmit: ({ value }) => {
			mutate(value);
			navigate({ to: "/users" });
		},
	});

	return (
		<UserFormLayout title={m.users_breadcrumb_new()}>
			<form.AppForm>
				<form.UnsavedChangesWarning />
				<form
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						form.handleSubmit();
					}}
					className="space-y-4"
				>
					<form.AppField name="name">
						{(field) => (
							<field.TextField
								label={m.users_form_name_label()}
								placeholder={m.users_form_name_placeholder()}
								required
							/>
						)}
					</form.AppField>

					<form.AppField name="email">
						{(field) => (
							<field.TextField
								label={m.users_form_email_label()}
								type="email"
								placeholder={m.users_form_email_placeholder()}
								required
							/>
						)}
					</form.AppField>

					<form.AppField name="phoneNumber">
						{(field) => (
							<field.PhoneInput
								label={m.users_form_phone_label()}
								placeholder={m.users_form_phone_placeholder()}
								description={m.users_form_phone_description()}
							/>
						)}
					</form.AppField>

					<form.AppField name="password">
						{(field) => (
							<field.TextField
								label={m.users_form_password_label()}
								type="password"
								placeholder={m.users_form_password_placeholder()}
								description={m.users_form_password_description()}
								required
							/>
						)}
					</form.AppField>

					<div className="flex justify-between pt-4">
						<form.ResetButton />
						<form.SubmitButton label={m.users_form_submit_create()} />
					</div>
				</form>
			</form.AppForm>
		</UserFormLayout>
	);
}

// ----------------------------------------------------------------------

export function UserEditForm({
	initialValues,
}: {
	initialValues: UserDetails;
}) {
	const navigate = useNavigate();
	const { mutate } = useMutation(userMutations.update(initialValues.id));

	const defaultValues: UserUpdateInput = {
		name: initialValues.name,
		email: initialValues.email,
		phoneNumber: initialValues.phoneNumber,
		image: null,
	};

	const form = useAppForm({
		defaultValues,
		validators: {
			onSubmit: userUpdateClientSchema,
		},
		onSubmit: ({ value }) => {
			mutate(value);
			navigate({ to: "/users" });
		},
	});

	return (
		<UserFormLayout title={m.users_breadcrumb_edit()}>
			<form.AppForm>
				<form.UnsavedChangesWarning />
				<form
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						form.handleSubmit();
					}}
					className="space-y-4"
				>
					<form.AppField name="name">
						{(field) => (
							<field.TextField
								label={m.users_form_name_label()}
								placeholder={m.users_form_name_placeholder()}
								required
							/>
						)}
					</form.AppField>

					<form.AppField name="email">
						{(field) => (
							<field.TextField
								label={m.users_form_email_label()}
								type="email"
								placeholder={m.users_form_email_placeholder()}
								required
							/>
						)}
					</form.AppField>

					<form.AppField name="phoneNumber">
						{(field) => (
							<field.PhoneInput
								label={m.users_form_phone_label()}
								placeholder={m.users_form_phone_placeholder()}
								description={m.users_form_phone_description()}
							/>
						)}
					</form.AppField>

					<div className="flex justify-between pt-4">
						<form.ResetButton />
						<form.SubmitButton label={m.users_form_submit_update()} />
					</div>
				</form>
			</form.AppForm>
		</UserFormLayout>
	);
}
