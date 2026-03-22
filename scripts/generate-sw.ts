import { build } from "esbuild";
import { injectManifest } from "workbox-build";
import { resolve, dirname } from "node:path";
import { existsSync, unlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
// TanStack Start outputs to .output/public, not dist/client
const distClient = resolve(__dirname, "../.output/public");
const srcSw = resolve(__dirname, "../src/sw.ts");

async function generateServiceWorker() {
	if (!existsSync(distClient)) {
		console.error("Error: dist/client does not exist. Run build first.");
		process.exit(1);
	}

	// Use esbuild to transpile TypeScript to JavaScript
	console.log("Transpiling service worker...");

	const tempSwPath = resolve(distClient, "sw-src.js");

	try {
		await build({
			entryPoints: [srcSw],
			bundle: true,
			format: "esm",
			target: "es2020",
			outfile: tempSwPath,
			minify: false,
		});
	} catch (error) {
		console.error("Failed to transpile service worker:", error);
		process.exit(1);
	}

	console.log("Generating service worker with workbox...");

	try {
		const { count, size, warnings } = await injectManifest({
			swSrc: tempSwPath,
			swDest: resolve(distClient, "sw.js"),
			globDirectory: distClient,
			globPatterns: ["**/*.{js,css,ico,png,svg,woff2,webp}"],
			globIgnores: ["sw-src.js", "sw.js"],
			maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5MB
		});

		// Clean up temp file
		unlinkSync(tempSwPath);

		if (warnings.length > 0) {
			console.warn("Warnings:", warnings.join("\n"));
		}

		console.log(
			`✓ Service worker generated with ${count} files, totaling ${(size / 1024).toFixed(1)} KB`,
		);
	} catch (error) {
		console.error("Error generating service worker:", error);
		process.exit(1);
	}
}

generateServiceWorker();
