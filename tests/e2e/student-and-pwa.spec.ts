import { expect, test } from "@playwright/test";

test.describe("student client and PWA smoke tests", () => {
	test("opens the public student view from the root landing route", async ({
		page,
	}) => {
		await page.goto("/");

		await expect(page).toHaveURL(/\/$/);
		await expect(page.getByText("Student Hub")).toBeVisible();
		await expect(
			page.getByRole("link", { name: /teacher dashboard/i }),
		).toBeVisible();
	});

	test("renders the public student lesson shell", async ({ page }) => {
		await page.goto("/student");

		await expect(page.getByText("Student Hub")).toBeVisible();
		await expect(page.getByRole("heading", { name: /lessons/i })).toBeVisible();
		await expect(page.getByRole("searchbox")).toBeVisible();
	});

	test("keeps dashboard routes behind authentication", async ({ page }) => {
		await page.goto("/lessons");

		await expect(page).toHaveURL(/\/sign-in/);
		await expect(page.getByLabel("Email")).toBeVisible();
		await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
	});

	test("renders the offline fallback page", async ({ page }) => {
		await page.goto("/offline.html");

		await expect(page.locator("body")).toContainText(/offline|connection/i);
	});
});
