import { expect, type Page, test } from "@playwright/test";

const teacherCredentials = {
	email: process.env.E2E_TEACHER_EMAIL ?? "test@gmail.com",
	password: process.env.E2E_TEACHER_PASSWORD ?? "@Sample1",
};

async function signIn(page: Page, credentials: typeof teacherCredentials) {
	await page.goto("/sign-in?returnTo=/lessons/create");
	await page.getByLabel("Email").fill(credentials.email);
	await page.getByLabel("Password").fill(credentials.password);
	await page.getByRole("button", { name: /^sign in$/i }).click();
}

async function signUpDisposableTeacher(page: Page) {
	const credentials = {
		email: `playwright.teacher.${Date.now()}@example.test`,
		password: "@Sample1",
	};

	await page.goto("/sign-up");
	await page.getByLabel("Full Name").fill("Playwright Teacher");
	await page.getByLabel("Email").fill(credentials.email);
	await page.getByLabel("Password", { exact: true }).fill(credentials.password);
	await page.getByLabel("Confirm Password").fill(credentials.password);
	await page.getByRole("button", { name: /create account/i }).click();
	await expect(page).toHaveURL(/\/sign-in/);

	return credentials;
}

test.describe("teacher lesson creation workflow", () => {
	test("signs in and creates a published lesson", async ({ page }) => {
		const lessonTitle = `Playwright Teacher Lesson ${Date.now()}`;

		await signIn(page, teacherCredentials);

		try {
			await expect(page).toHaveURL(
				(url) => url.pathname === "/lessons/create",
				{ timeout: 5_000 },
			);
		} catch {
			const disposableTeacher = await signUpDisposableTeacher(page);
			await signIn(page, disposableTeacher);
		}

		await expect(page).toHaveURL((url) => url.pathname === "/lessons/create");

		await expect(
			page.getByRole("heading", { name: /create lesson/i }),
		).toBeVisible();
		await page.getByLabel("Title").fill(lessonTitle);
		await page.getByLabel("Grade Level").fill("6");
		await page.getByLabel("Duration (minutes)").fill("25");

		await page.locator(".ProseMirror").click();
		await page
			.locator(".ProseMirror")
			.fill("This is an automated teacher workflow lesson for Chapter 8 testing.");

		await page
			.getByLabel("Teacher Notes")
			.fill("Created by Playwright using the thesis test teacher account.");
		await page.getByRole("button", { name: /create lesson/i }).click();

		await expect(page).toHaveURL(/\/lessons/);
		await expect(page.getByText(lessonTitle)).toBeVisible();
	});
});
