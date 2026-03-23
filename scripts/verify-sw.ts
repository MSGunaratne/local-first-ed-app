import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";

const rootDir = process.cwd();
const candidates = [resolve(rootDir, "dist/client/sw.js"), resolve(rootDir, ".output/public/sw.js")];
const existingFile = candidates.find((candidate) => existsSync(candidate));

if (!existingFile) {
	console.error(
		`Service worker verification failed: sw.js was not found. Checked: ${candidates.join(", ")}`,
	);
	process.exit(1);
}

const size = statSync(existingFile).size;

if (size <= 0) {
	console.error(`Service worker verification failed: ${existingFile} is empty.`);
	process.exit(1);
}

console.log(`Service worker verified at ${existingFile} (${size} bytes).`);
