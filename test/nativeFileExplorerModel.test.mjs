import test from "node:test";
import assert from "node:assert/strict";
import {
	fileVisualKindForPath,
	joinVaultPath,
	nextAvailableMarkdownPath,
} from "./.build/nativeFileExplorerModel.js";

test("file visual kinds are extension-based and case-insensitive", () => {
	assert.equal(fileVisualKindForPath("Notes/计划.md"), "markdown");
	assert.equal(fileVisualKindForPath("资料/报告.PDF"), "pdf");
	assert.equal(fileVisualKindForPath("Books/设计.epub"), "epub");
	assert.equal(fileVisualKindForPath("Assets/Hero.JPEG"), "image");
	assert.equal(fileVisualKindForPath("Assets/diagram.svg"), "image");
	assert.equal(fileVisualKindForPath("Archive/data.zip"), "archive");
});

test("a virtualized attachment row can classify from Obsidian's extension badge", () => {
	assert.equal(fileVisualKindForPath("Assets/Pasted image 20260902", "PNG"), "image");
	assert.equal(fileVisualKindForPath("Books/Design systems", "EPUB"), "epub");
	assert.equal(fileVisualKindForPath("Reports/Annual", "PDF"), "pdf");
});

test("vault paths join root and nested folders without duplicate slashes", () => {
	assert.equal(joinVaultPath("", "未命名.md"), "未命名.md");
	assert.equal(joinVaultPath("/Projects/Active/", "/未命名.md"), "Projects/Active/未命名.md");
});

test("new-note names advance without overwriting an existing file", () => {
	const existing = new Set([
		"Projects/未命名.md",
		"Projects/未命名 1.md",
	]);
	const path = nextAvailableMarkdownPath("Projects", (candidate) => existing.has(candidate));
	assert.equal(path, "Projects/未命名 2.md");
});

test("a free default name is used immediately", () => {
	assert.equal(nextAvailableMarkdownPath("Inbox", () => false), "Inbox/未命名.md");
});
