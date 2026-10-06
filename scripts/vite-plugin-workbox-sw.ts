import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { injectManifest } from "workbox-build";
import { build, type Plugin, type ResolvedConfig } from "vite";

const SW_FILENAME = "sw.js";

export function workboxServiceWorkerPlugin(): Plugin {
	let config: ResolvedConfig | null = null;
	let hasGenerated = false;

	return {
		name: "workbox-service-worker",
		enforce: "post",
		configResolved(resolvedConfig) {
			config = resolvedConfig;
		},
		async closeBundle() {
			if (!config || config.command !== "build") {
				return;
			}

			if (hasGenerated) {
				return;
			}

			hasGenerated = true;

			const rootDir = config.root;
			const outputCandidates = [
				resolve(rootDir, ".output/public"),
				resolve(rootDir, "dist/client"),
			];
			const outputDir = outputCandidates.find((candidate) => existsSync(candidate));
			const swEntry = resolve(rootDir, "src/sw.ts");

			if (!outputDir) {
				throw new Error(
					`Service worker generation failed: no client output directory found. Checked: ${outputCandidates.join(", ")}.`,
				);
			}

			const swDest = resolve(outputDir, SW_FILENAME);

			if (!existsSync(outputDir)) {
				throw new Error(
					`Service worker generation failed: output directory not found at ${outputDir}.`,
				);
			}

			await build({
				root: rootDir,
				configFile: false,
				publicDir: false,
				define: {
					"process.env.NODE_ENV": JSON.stringify("production"),
				},
				build: {
					emptyOutDir: false,
					minify: true,
					outDir: outputDir,
					lib: {
						entry: swEntry,
						formats: ["es"],
						fileName: () => SW_FILENAME,
					},
					rollupOptions: {
						output: {
							entryFileNames: SW_FILENAME,
						},
					},
				},
				logLevel: "error",
			});

			const { count, size, warnings } = await injectManifest({
				swSrc: swDest,
				swDest,
				globDirectory: outputDir,
				globPatterns: [
					"**/*.{css,html,ico,png,svg,webmanifest,webp,woff,woff2}",
				],
				globIgnores: [SW_FILENAME, "ocr-data/**"],
				maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
			});

			if (warnings.length > 0) {
				console.warn("Service worker manifest warnings:\n" + warnings.join("\n"));
			}

			console.log(
				`Service worker generated at /${SW_FILENAME} with ${count} precached files (${(
					size / 1024
				).toFixed(1)} KB).`,
			);
		},
	};
}
