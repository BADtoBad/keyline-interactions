// Compiles the pure, DOM-free modules under test to test/.build so the tests
// exercise shipped source rather than a copy.
//
// bundle:true is deliberate. With bundle:false, esbuild preserves relative
// import paths verbatim — `./dragRange` with no extension — which TypeScript
// accepts but Node's ESM loader rejects at runtime. Bundling makes each entry
// self-contained and sidesteps extension resolution entirely.
//
// @codemirror/* stays external so tests resolve the same single copy from
// node_modules that the harness uses. A second copy would break facet identity,
// exactly as it did with @codemirror/state and history().
import esbuild from "esbuild";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";

const OUT_DIR = "test/.build";

// Node resolves a .js file's module type from the nearest package.json. The
// repo root declares no "type", so it defaults to commonjs, and these files
// are ESM — Node 18 then reads `export` as a syntax error and every test file
// that imports one dies with "Named export not found ... is a CommonJS module".
//
// It passed locally only because Node 20.10+ retries a failed CommonJS parse
// as ESM. Node 18 has no such fallback, so this broke the moment CI ran the
// suite for the first time. Declaring the type here fixes it on every version
// instead of relying on the runtime to guess.
rmSync(OUT_DIR, { force: true, recursive: true });
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(`${OUT_DIR}/package.json`, JSON.stringify({ type: "module" }, null, "\t") + "\n");

await esbuild.build({
	entryPoints: [
		"src/locale/ui.ts",
		"src/syntaxAnalysis.ts",
		"src/frameScheduler.ts",
		"src/blockSelection.ts",
		"src/dragRange.ts",
		"src/handleZone.ts",
		"src/foldRange.ts",
		"src/insertRegistry.ts",
		"src/planMove.ts",
		"src/blockCommands.ts",
		"src/insertPlan.ts",
		"src/slashTrigger.ts",
		"src/attachmentLink.ts",
		"src/codeFence.ts",
		"src/menuPosition.ts",
		"src/colorWrap.ts",
		"src/selectionFormatting.ts",
		"src/tableOfContents.ts",
		"src/surfaceCoordinator.ts",
		"src/themeLayout.ts",
		"src/nativeFileExplorerModel.ts",
		"src/fileIconModel.ts",
		"src/fileIconAssets.ts",
		"src/wikilinkInputModel.ts",
		"src/mentionModel.ts",
		"src/styledBlockModel.ts",
		"src/editorLayoutModel.ts",
		"src/listSeparatorModel.ts",
		"src/workspaceLayouts.ts",
		"src/workspaceMenuPosition.ts",
		"src/settingsNavigation.ts",
	],
	outdir: "test/.build",
	format: "esm",
	bundle: true,
	external: ["@codemirror/*", "@lezer/*", "obsidian"],
	logLevel: "error",
});

// A local browser measurement uses the same CodeMirror build as production.
// It is intentionally separate from the DOM-free Node suite and is not a
// substitute for final visual acceptance inside Obsidian.
await esbuild.build({
	entryPoints: ["test/browser/listSeparatorFixture.ts"],
	outfile: "test/.build/listSeparatorFixture.js",
	format: "iife",
	bundle: true,
	logLevel: "error",
});

await esbuild.build({
	entryPoints: ["test/browser/pageLayoutFixture.ts"],
	outfile: "test/.build/pageLayoutFixture.js",
	format: "iife",
	bundle: true,
	logLevel: "error",
});
