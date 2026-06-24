import { expect, test } from "@playwright/test";

const teacherCredentials = {
	email: "test@gmail.com",
	password: "@Sample1",
};

test.describe("teacher lesson creation workflow", () => {
	test("signs in and creates a published lesson", async ({ page }) => {
		const lessonTitle = `Playwright Teacher Lesson ${Date.now()}`;

		await page.goto("/sign-in?returnTo=/lessons/create");
		await page.getByLabel("Email").fill(teacherCredentials.email);
		await page.getByLabel("Password").fill(teacherCredentials.password);
		await page.getByRole("button", { name: /^sign in$/i }).click();

		await expect(page).toHaveURL(/\/lessons\/create/);

		await expect(
			page.getByRole("heading", { name: /lesson details/i }),
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
