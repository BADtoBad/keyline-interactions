import esbuild from "esbuild";
import process from "process";
import fs from "node:fs";
import path from "node:path";
import { builtinModules as builtins } from "node:module";

const prod = process.argv[2] === "production";

// A production build lands in the repo root, which is where Obsidian's own
// release workflow and its community-plugin tooling expect main.js to be — a
// build that only ever wrote into somebody's vault produced no release asset
// at all on CI.
//
// Development also stays local by default. Direct Vault writes require an
// explicit VAULT_PLUGIN_DIR; normal installation uses the backup-first script.
const outDir = prod ? "." : (process.env.VAULT_PLUGIN_DIR ?? ".");

fs.mkdirSync(outDir, { recursive: true });

// manifest.json and styles.css are not bundled — Obsidian reads them from the
// plugin folder directly, so they have to be copied on every build.
const copyAssets = (target) => {
	if (path.resolve(target) === path.resolve(".")) return;
	for (const file of ["manifest.json", "styles.css"]) {
		if (fs.existsSync(file)) {
			fs.copyFileSync(file, path.join(target, file));
		}
	}
};

const assetsPlugin = {
	name: "copy-assets",
	setup(build) {
		build.onEnd((result) => {
			if (result.errors.length > 0) return;
			copyAssets(outDir);
			console.log(`[Keyline] → ${path.resolve(outDir)}`);
		});
	},
};

const context = await esbuild.context({
	entryPoints: ["src/main.ts"],
	tsconfig: "tsconfig.json",
	bundle: true,
	external: [
		"obsidian",
		"electron",
		"@codemirror/autocomplete",
		"@codemirror/collab",
		"@codemirror/commands",
		"@codemirror/language",
		"@codemirror/lint",
		"@codemirror/search",
		"@codemirror/state",
		"@codemirror/view",
		"@lezer/common",
		"@lezer/highlight",
		"@lezer/lr",
		...builtins,
	],
	format: "cjs",
	target: "es2018",
	logLevel: "info",
	sourcemap: prod ? false : "inline",
	treeShaking: true,
	outfile: path.join(outDir, "main.js"),
	plugins: [assetsPlugin],
});

if (prod) {
	await context.rebuild();
	process.exit(0);
} else {
	await context.watch();
}
