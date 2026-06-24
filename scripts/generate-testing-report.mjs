import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const PROJECT_NAME = "Local First Education App";
const AUTHOR = "Mojitha Gunaratne";
const VERSION = "1.0";
const EXECUTION_DATE = "2026-06-24";
const OUTPUT_PATH = "output/testing/local-first-ed-testing-outcomes.xlsx";
const RESULT_DIR = "test-results";

const COLUMNS = [
	"Functional Requirement No/Ref",
	"Test Case ID",
	"Testcase Objective",
	"Testcase Description",
	"Pre-requisites",
	"Input Data",
	"Expected Results",
	"Actual Results",
	"Execution Status",
	"Notes",
];

async function exists(filePath) {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}

async function readJson(filePath) {
	if (!(await exists(filePath))) return null;
	return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function resolveArtifactTool() {
	try {
		return await import("@oai/artifact-tool");
	} catch {
		const require = createRequire(import.meta.url);
		const moduleRoots = [
			process.env.ARTIFACT_TOOL_NODE_MODULES,
			"C:\\Users\\tempa\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules",
		].filter(Boolean);

		for (const moduleRoot of moduleRoots) {
			try {
				const resolved = require.resolve("@oai/artifact-tool", {
					paths: [moduleRoot],
				});
				return await import(pathToFileURL(resolved).href);
			} catch {
				// Try the next configured module root.
			}
		}
	}

	throw new Error(
		"@oai/artifact-tool is required to generate the testing workbook. Set ARTIFACT_TOOL_NODE_MODULES to the bundled node_modules path.",
	);
}

function getVitestStatus(vitest) {
	if (!vitest) {
		return {
			status: "Not Run",
			actual: "Vitest result file was not found.",
		};
	}

	const failed =
		Number(vitest.numFailedTests ?? 0) + Number(vitest.numFailedTestSuites ?? 0);
	const passed = Number(vitest.numPassedTests ?? 0);
	const total = Number(vitest.numTotalTests ?? passed + failed);

	return failed === 0
		? {
				status: "Pass",
				actual: `Vitest passed ${passed}/${total} tests.`,
			}
		: {
				status: "Fail",
				actual: `Vitest reported ${failed} failed test(s) out of ${total}.`,
			};
}

function countPlaywrightFailures(node) {
	if (!node || typeof node !== "object") return 0;
	let failures = 0;

	if (Array.isArray(node.specs)) {
		for (const spec of node.specs) {
			for (const test of spec.tests ?? []) {
				for (const result of test.results ?? []) {
					if (result.status !== "passed" && result.status !== "skipped") {
						failures += 1;
					}
				}
			}
		}
	}

	for (const suite of node.suites ?? []) {
		failures += countPlaywrightFailures(suite);
	}

	return failures;
}

function countPlaywrightTests(node) {
	if (!node || typeof node !== "object") return 0;
	let total = 0;

	if (Array.isArray(node.specs)) {
		for (const spec of node.specs) {
			total += spec.tests?.length ?? 0;
		}
	}

	for (const suite of node.suites ?? []) {
		total += countPlaywrightTests(suite);
	}

	return total;
}

function getPlaywrightStatus(playwright) {
	if (!playwright) {
		return {
			status: "Not Run",
			actual: "Playwright result file was not found.",
		};
	}

	const topLevelErrors = playwright.errors ?? [];
	if (topLevelErrors.length > 0) {
		const firstError = topLevelErrors[0]?.message ?? "Unknown Playwright error.";
		const isServerTimeout = firstError.includes("config.webServer");

		return {
			status: isServerTimeout ? "Blocked" : "Fail",
			actual: isServerTimeout
				? "Playwright did not execute browser tests because the preview web server timed out."
				: `Playwright failed before completing browser tests: ${firstError}`,
		};
	}

	const failed = countPlaywrightFailures(playwright);
	const total = countPlaywrightTests(playwright);

	if (total === 0) {
		return {
			status: "Not Run",
			actual: "Playwright result file contained no executed browser tests.",
		};
	}

	return failed === 0
		? {
				status: "Pass",
				actual: `Playwright passed ${total}/${total} browser test(s).`,
			}
		: {
				status: "Fail",
				actual: `Playwright reported ${failed} failed browser test(s) out of ${total}.`,
			};
}

async function getCommandStatus(fileName, label) {
	const filePath = path.join(RESULT_DIR, fileName);
	if (!(await exists(filePath))) {
		return {
			status: "Not Run",
			actual: `${label} output file was not found.`,
		};
	}

	const output = await fs.readFile(filePath, "utf8");
	const exitMatch = output.match(/\[exit-code:(\d+)\]/);
	const exitCode = exitMatch ? Number(exitMatch[1]) : 0;

	return exitCode === 0
		? {
				status: "Pass",
				actual: `${label} completed successfully.`,
			}
		: {
				status: "Fail",
				actual: `${label} failed with exit code ${exitCode}.`,
			};
}

function caseRow({
	ref,
	id,
	objective,
	description,
	prerequisites,
	inputData,
	expected,
	statusSource,
	notes = "",
}) {
	return [
		ref,
		id,
		objective,
		description,
		prerequisites,
		inputData,
		expected,
		statusSource.actual,
		statusSource.status,
		notes,
	];
}

function buildFunctionalRows(statuses) {
	const blockedTeacher = {
		status: "Blocked",
		actual: "Seeded teacher authentication fixture is not available yet.",
	};
	const manualNotRun = {
		status: "Not Run",
		actual: "Manual pilot/user test has not been executed yet.",
	};

	return [
		caseRow({
			ref: "FR01",
			id: "FR01/1",
			objective: "Verify student lesson shell and offline-oriented access path.",
			description: "Open the public student client and verify the lesson browsing UI is available.",
			prerequisites: "Application preview server is running.",
			inputData: "/student",
			expected: "Student Hub, lesson heading, search, and subject filters render.",
			statusSource: statuses.playwright,
			notes: "Automated in Playwright desktop and mobile projects.",
		}),
		caseRow({
			ref: "FR02",
			id: "FR02/1",
			objective: "Verify PHWD image upload continues to use OCR directly.",
			description: "Upload a supported image to the curation panel.",
			prerequisites: "Curation panel is rendered with OCR mocked.",
			inputData: "notes.png",
			expected: "OCR scan function receives the original image file.",
			statusSource: statuses.vitest,
		}),
		caseRow({
			ref: "FR02",
			id: "FR02/2",
			objective: "Verify first-page PDF PHWD support.",
			description: "Upload a PDF and convert page 1 to an image before OCR.",
			prerequisites: "PDF.js utility and curation panel are available.",
			inputData: "notes.pdf",
			expected: "PDF page 1 is converted to PNG and passed to OCR.",
			statusSource: statuses.vitest,
			notes: "Only first page is in scope.",
		}),
		caseRow({
			ref: "FR03",
			id: "FR03/1",
			objective: "Verify automatic curriculum alignment.",
			description: "Run matcher against English, ICT, Mathematics, Sinhala, typo, and no-match samples.",
			prerequisites: "Curriculum JSON files are available.",
			inputData: "OCR-like curriculum terms",
			expected: "Correct curriculum item is ranked first and unrelated noise returns no matches.",
			statusSource: statuses.vitest,
		}),
		caseRow({
			ref: "FR04",
			id: "FR04/1",
			objective: "Verify MELS analytics payload validation.",
			description: "Validate pseudonymous session, event, feedback, and progress schemas.",
			prerequisites: "Analytics schemas are loaded.",
			inputData: "Anonymous session/event/progress payloads",
			expected: "Valid payloads pass and invalid ratings/statuses/batch sizes fail.",
			statusSource: statuses.vitest,
		}),
		caseRow({
			ref: "FR05",
			id: "FR05/1",
			objective: "Verify queued synchronization behavior.",
			description: "Enqueue, flush, retry, and reconcile local progress events.",
			prerequisites: "Mutation queue is tested with a fake SQLite outbox.",
			inputData: "Lesson and progress mutations",
			expected: "Successful mutations are removed, failures are retained for retry, progress events mark synced.",
			statusSource: statuses.vitest,
		}),
		caseRow({
			ref: "FR06",
			id: "FR06/1",
			objective: "Verify Sinhala/PDF upload copy exists.",
			description: "Check message catalog and type generation through build/typecheck.",
			prerequisites: "Message files and generated Paraglide outputs are available.",
			inputData: "en/si message keys",
			expected: "Application typecheck/build succeeds with Sinhala and English messages.",
			statusSource: statuses.typecheck,
		}),
		caseRow({
			ref: "FR07",
			id: "FR07/1",
			objective: "Verify dashboard routes remain protected.",
			description: "Open teacher dashboard lesson route while unauthenticated.",
			prerequisites: "Application preview server is running.",
			inputData: "/lessons",
			expected: "Unauthenticated user is redirected to sign-in.",
			statusSource: statuses.playwright,
		}),
		caseRow({
			ref: "FR08",
			id: "FR08/1",
			objective: "Verify feedback-as-survey validation.",
			description: "Validate rating and optional comment fields.",
			prerequisites: "Lesson feedback schema is available.",
			inputData: "Rating 1-5 and comment",
			expected: "Ratings outside 1-5 are rejected; valid comments are trimmed.",
			statusSource: statuses.vitest,
			notes: "Full survey module remains out of scope.",
		}),
		caseRow({
			ref: "FR09",
			id: "FR09/1",
			objective: "Confirm no real-time synchronous feature is required for access.",
			description: "Run build and browser smoke tests without websocket/live-session dependency.",
			prerequisites: "Build and browser smoke tests execute.",
			inputData: "Production build",
			expected: "Application builds and browser tests run without real-time service setup.",
			statusSource: statuses.build,
		}),
		caseRow({
			ref: "R09/R10",
			id: "FT-BLOCKED/1",
			objective: "Verify full teacher lesson creation with authenticated account.",
			description: "Sign in as teacher, upload PHWD, apply curriculum match, save lesson.",
			prerequisites: "Seeded teacher credentials/test auth fixture.",
			inputData: "Teacher account and PHWD file",
			expected: "Lesson is created and appears for students.",
			statusSource: blockedTeacher,
			notes: "Requires an agreed safe seeded auth fixture.",
		}),
		caseRow({
			ref: "R13",
			id: "FT-MANUAL/1",
			objective: "Collect perceived usability and effectiveness feedback.",
			description: "Run SUS/usability questionnaire after teacher/student tasks.",
			prerequisites: "Pilot participants and consent.",
			inputData: "SUS/user feedback form",
			expected: "Responses are collected for Chapter 8/9 discussion.",
			statusSource: manualNotRun,
		}),
	];
}

function buildNonFunctionalRows(statuses) {
	const manualNotRun = {
		status: "Not Run",
		actual: "Manual/device test has not been executed yet.",
	};

	return [
		caseRow({
			ref: "NFR01",
			id: "NFR01/1",
			objective: "Verify mobile compatibility through browser emulation.",
			description: "Run student client smoke tests in Pixel 5 emulation.",
			prerequisites: "Playwright mobile project is configured.",
			inputData: "Pixel 5 viewport/device profile",
			expected: "Student shell renders without layout failure.",
			statusSource: statuses.playwright,
			notes: "Real low-end Android device evidence should still be added.",
		}),
		caseRow({
			ref: "NFR02",
			id: "NFR02/1",
			objective: "Verify offline fallback is available.",
			description: "Open the generated offline fallback page.",
			prerequisites: "Preview server is running.",
			inputData: "/offline.html",
			expected: "Offline/connection guidance is visible.",
			statusSource: statuses.playwright,
		}),
		caseRow({
			ref: "NFR03",
			id: "NFR03/1",
			objective: "Verify pseudonymous analytics data validation.",
			description: "Validate MELS payloads do not require direct student identifiers.",
			prerequisites: "Analytics schema tests execute.",
			inputData: "pseudonymousActorId payloads",
			expected: "Payloads validate with pseudonymous IDs and no student names.",
			statusSource: statuses.vitest,
			notes: "Local encryption-at-rest intentionally not implemented for anonymised/pseudonymous pilot data.",
		}),
		caseRow({
			ref: "NFR03",
			id: "NFR03/2",
			objective: "Verify role-based boundary for teacher dashboard.",
			description: "Attempt to open a dashboard route while unauthenticated.",
			prerequisites: "Preview server is running.",
			inputData: "/lessons",
			expected: "User is redirected to sign-in.",
			statusSource: statuses.playwright,
		}),
		caseRow({
			ref: "NFR04",
			id: "NFR04/1",
			objective: "Evaluate usability using SUS/task observation.",
			description: "Observe teacher/student task completion and collect SUS.",
			prerequisites: "Pilot users and consent.",
			inputData: "Create lesson, open lesson, complete lesson, submit feedback tasks",
			expected: "SUS and task success results are recorded.",
			statusSource: manualNotRun,
		}),
		caseRow({
			ref: "NFR05",
			id: "NFR05/1",
			objective: "Verify production build and service worker generation.",
			description: "Build the app and run service-worker verification.",
			prerequisites: "Dependencies installed.",
			inputData: "Production build",
			expected: "Build and service-worker verification complete successfully.",
			statusSource: statuses.build,
		}),
		caseRow({
			ref: "NFR05",
			id: "NFR05/2",
			objective: "Verify sync queue reliability at unit level.",
			description: "Exercise queue success/failure/retry logic.",
			prerequisites: "Mutation queue unit tests execute.",
			inputData: "Fake queued mutations",
			expected: "Queue preserves failed mutations and removes successful ones.",
			statusSource: statuses.vitest,
		}),
	];
}

function countByStatus(rows, status) {
	return rows.filter((row) => row[8] === status).length;
}

function styleSheet(sheet, rowCount) {
	sheet.showGridLines = false;
	sheet.getRange("B2:J2").merge();
	sheet.getRange("B2").values = [["System Testing [Template]"]];
	sheet.getRange("B2").format = {
		font: { bold: true, size: 20, color: "#000000" },
	};

	sheet.getRange("B4:C7").format.borders = {
		preset: "all",
		style: "thin",
		color: "#000000",
	};
	sheet.getRange("B4:B7").format = {
		fill: "#FFD733",
		font: { bold: true },
	};

	const headerRange = sheet.getRange("B10:K10");
	headerRange.format = {
		fill: "#4656A3",
		font: { bold: true, color: "#FFFFFF" },
		wrapText: true,
	};
	sheet.getRange(`B10:K${rowCount}`).format.borders = {
		preset: "all",
		style: "thin",
		color: "#4B5563",
	};
	sheet.getRange(`B11:K${rowCount}`).format.wrapText = true;
	sheet.getRange("B:K").format.columnWidth = 18;
	sheet.getRange("D:E").format.columnWidth = 30;
	sheet.getRange("H:H").format.columnWidth = 36;
	sheet.getRange("I:I").format.columnWidth = 28;
	sheet.getRange("K:K").format.columnWidth = 34;
	sheet.freezePanes.freezeRows(10);
	sheet.getRange(`J11:J${rowCount}`).dataValidation = {
		rule: { type: "list", values: ["Pass", "Fail", "Not Run", "Blocked"] },
	};
}

async function writeTestingSheet(workbook, name, rows) {
	const sheet = workbook.worksheets.add(name);
	const metadata = [
		["Project Name", PROJECT_NAME],
		["Test Case Author", AUTHOR],
		["Test Case Version", VERSION],
		["Test Execution Date", EXECUTION_DATE],
	];
	sheet.getRange("B4:C7").values = metadata;
	sheet.getRange("B10:K10").values = [COLUMNS];
	sheet.getRangeByIndexes(10, 1, rows.length, COLUMNS.length).values = rows;
	styleSheet(sheet, rows.length + 10);
}

function writeSummarySheet(workbook, functionalRows, nonFunctionalRows) {
	const sheet = workbook.worksheets.add("Summary");
	const allRows = [...functionalRows, ...nonFunctionalRows];

	sheet.showGridLines = false;
	sheet.getRange("B2:F2").merge();
	sheet.getRange("B2").values = [["Testing Outcome Summary"]];
	sheet.getRange("B2").format = {
		font: { bold: true, size: 20 },
	};

	sheet.getRange("B4:C10").values = [
		["Project Name", PROJECT_NAME],
		["Execution Date", EXECUTION_DATE],
		["Total Test Cases", allRows.length],
		["Pass", countByStatus(allRows, "Pass")],
		["Fail", countByStatus(allRows, "Fail")],
		["Not Run", countByStatus(allRows, "Not Run")],
		["Blocked", countByStatus(allRows, "Blocked")],
	];

	sheet.getRange("B4:B10").format = {
		fill: "#FFD733",
		font: { bold: true },
	};
	sheet.getRange("B4:C10").format.borders = {
		preset: "all",
		style: "thin",
		color: "#000000",
	};
	sheet.getRange("E4:H8").values = [
		["Thesis Testing Notes", "", "", ""],
		[
			"Student/Class modules",
			"Full student profiles, class administration, and enrollments were de-scoped because the pilot school did not permit sensitive student-identifiable data entry.",
			"",
			"",
		],
		[
			"Local encryption",
			"Encryption-at-rest was intentionally not implemented for anonymised/pseudonymous MELS data; the prototype uses data minimisation, pseudonymous IDs, idempotency, and transport security.",
			"",
			"",
		],
		[
			"PDF PHWD",
			"Only first-page PDF-to-image conversion is in scope for the prototype.",
			"",
			"",
		],
		[
			"Manual validation",
			"SUS, real low-end Android device checks, and field sync reliability remain manual/pilot evidence items.",
			"",
			"",
		],
	];
	sheet.getRange("E4:H4").merge();
	sheet.getRange("E5:H8").merge(true);
	sheet.getRange("E4:H8").format = {
		wrapText: true,
		borders: { preset: "all", style: "thin", color: "#CBD5E1" },
	};
	sheet.getRange("E4").format = {
		fill: "#4656A3",
		font: { bold: true, color: "#FFFFFF" },
	};
	sheet.getRange("B:H").format.columnWidth = 22;
	sheet.getRange("F:H").format.columnWidth = 30;
}

async function main() {
	const [{ SpreadsheetFile, Workbook }, vitest, playwright, typecheck, build] =
		await Promise.all([
			resolveArtifactTool(),
			readJson(path.join(RESULT_DIR, "vitest-results.json")),
			readJson(path.join(RESULT_DIR, "playwright-results.json")),
			getCommandStatus("typecheck.txt", "TypeScript typecheck"),
			getCommandStatus("build.txt", "Production build"),
		]);

	const statuses = {
		vitest: getVitestStatus(vitest),
		playwright: getPlaywrightStatus(playwright),
		typecheck,
		build,
	};

	const functionalRows = buildFunctionalRows(statuses);
	const nonFunctionalRows = buildNonFunctionalRows(statuses);

	const workbook = Workbook.create();
	await writeTestingSheet(workbook, "Functional Testing", functionalRows);
	await writeTestingSheet(workbook, "Non-Functional Testing", nonFunctionalRows);
	writeSummarySheet(workbook, functionalRows, nonFunctionalRows);

	await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
	const output = await SpreadsheetFile.exportXlsx(workbook);
	await output.save(OUTPUT_PATH);

	console.log(`Testing report written to ${OUTPUT_PATH}`);
}

await main();
