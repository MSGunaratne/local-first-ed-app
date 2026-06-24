import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;
const baseURL = `http://127.0.0.1:${PORT}`;

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
		url: baseURL,
		reuseExistingServer: !process.env.CI,
		timeout: 180_000,
	},
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
		{
			name: "mobile-chrome",
			use: { ...devices["Pixel 5"] },
		},
	],
});
