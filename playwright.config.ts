import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;
const baseURL = `http://127.0.0.1:${PORT}`;
const teacherFlowPattern = "**/teacher-lesson-creation.spec.ts";
const includeTeacherFlow = process.env.E2E_RUN_TEACHER_FLOW === "1";

export default defineConfig({
	testDir: "./tests/e2e",
	outputDir: "test-results/playwright-artifacts",
	timeout: 30_000,
	expect: {
		timeout: 10_000,
	},
	fullyParallel: true,
	reporter: [
		["list"],
		["json", { outputFile: "test-results/playwright-results.json" }],
	],
	use: {
		baseURL,
		trace: "on-first-retry",
	},
	webServer: {
		command: `node ./node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port ${PORT}`,
		env: {
			...process.env,
			BETTER_AUTH_URL: baseURL,
		},
		url: baseURL,
		reuseExistingServer: !process.env.CI && !includeTeacherFlow,
		timeout: 180_000,
	},
	projects: [
		{
			name: "chromium",
			testIgnore: includeTeacherFlow ? [] : [teacherFlowPattern],
			use: { ...devices["Desktop Chrome"] },
		},
		{
			name: "mobile-chrome",
			testIgnore: [teacherFlowPattern],
			use: { ...devices["Pixel 5"] },
		},
	],
});
