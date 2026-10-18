import test from "node:test";
import assert from "node:assert/strict";
import {
	planEditorLayout,
	planEditorLayoutGaps,
} from "./.build/editorLayoutModel.js";

const compact = (text) => planEditorLayout(text).map((line) => ({
	kind: line.kind,
	line: line.lineNumber,
	first: line.isFirst,
	last: line.isLast,
}));

const compactGaps = (text) => planEditorLayoutGaps(text).map((gap) => ({
	at: gap.at,
	side: gap.side,
	before: gap.before,
	after: gap.after,
	direct: gap.direct,
}));

test("every prose source line is a paragraph boundary, including an editable blank", () => {
	assert.deepEqual(compact("第一行\n第二行\n\n新段落"), [
		{ kind: "paragraph", line: 1, first: true, last: true },
		{ kind: "paragraph", line: 2, first: true, last: true },
		{ kind: "paragraph", line: 3, first: true, last: true },
		{ kind: "paragraph", line: 4, first: true, last: true },
	]);
});

test("ordinary Enter boundaries use the dedicated paragraph gap", () => {
	assert.deepEqual(compactGaps("甲\n乙"), [
		{ at: 0, side: -1, before: "paragraph-before", after: undefined, direct: undefined },
		{ at: 2, side: -1, before: undefined, after: undefined, direct: "paragraph-gap" },
		{ at: 3, side: 1, before: undefined, after: "paragraph-after", direct: undefined },
	]);
});

test("an empty Enter row and its first typed glyph have identical boundary roles", () => {
	const empty = compactGaps("甲\n");
	const typed = compactGaps("甲\n乙");
	assert.deepEqual(
		empty.map(({ at, side, before, after, direct }) => ({ at, side, before, after, direct })),
		[
			{ at: 0, side: -1, before: "paragraph-before", after: undefined, direct: undefined },
			{ at: 2, side: -1, before: undefined, after: undefined, direct: "paragraph-gap" },
			{ at: 2, side: 1, before: undefined, after: "paragraph-after", direct: undefined },
		]
	);
	assert.deepEqual(
		typed.slice(0, 2),
		empty.slice(0, 2),
		"typing must not replace paragraph-after with paragraph-gap at the caret row"
	);
});

test("Quote to pending prose uses one collapsed external boundary before and after typing", () => {
	const empty = compactGaps("> Q\n");
	const typed = compactGaps("> Q\nB");
	assert.deepEqual(empty[1], {
		at: 4,
		side: -1,
		before: "paragraph-before",
		after: "paragraph-after",
		direct: undefined,
	});
	assert.deepEqual(typed[1], empty[1]);
});

test("plain Quote lines receive an internal gap without putting padding on text lines", () => {
	assert.deepEqual(compactGaps("> A\n> B"), [
		{ at: 0, side: -1, before: "paragraph-before", after: undefined, direct: undefined },
		{ at: 4, side: -1, before: undefined, after: undefined, direct: "quote-line" },
		{ at: 7, side: 1, before: undefined, after: "paragraph-after", direct: undefined },
	]);
});

test("list to Quote exposes only the Quote block edge", () => {
	assert.deepEqual(compactGaps("- A\n> B"), [
		{ at: 4, side: -1, before: "paragraph-before", after: undefined, direct: undefined },
		{ at: 7, side: 1, before: undefined, after: "paragraph-after", direct: undefined },
	]);
});

test("each adjacent ATX heading receives its own block boundary", () => {
	assert.deepEqual(compact("# 一\n## 二"), [
		{ kind: "heading", line: 1, first: true, last: true },
		{ kind: "heading", line: 2, first: true, last: true },
	]);
	assert.deepEqual(compactGaps("# 一\n## 二"), [
		{ at: 0, side: -1, before: "heading-before", after: undefined, direct: undefined },
		{ at: 4, side: -1, before: "heading-before", after: "heading-after", direct: undefined },
		{ at: 8, side: 1, before: undefined, after: "heading-after", direct: undefined },
	]);
});

test("a Setext heading is one two-line heading block", () => {
	assert.deepEqual(compact("标题\n---\n\n正文"), [
		{ kind: "heading", line: 1, first: true, last: false },
		{ kind: "heading", line: 2, first: false, last: true },
		{ kind: "paragraph", line: 3, first: true, last: true },
		{ kind: "paragraph", line: 4, first: true, last: true },
	]);
});

test("a list-start hyphen does not transiently acquire heading spacing", () => {
	for (const source of ["正文\n", "正文\n-", "正文\n--", "正文\n- "]) {
		const roles = compact(source);
		assert.equal(roles[0]?.kind, "paragraph", source);
		assert.notEqual(roles[1]?.kind, "heading", source);
	}
});

test("three hyphens under prose remain an intentional Setext heading", () => {
	assert.deepEqual(compact("标题\n---"), [
		{ kind: "heading", line: 1, first: true, last: false },
		{ kind: "heading", line: 2, first: false, last: true },
	]);
});

test("lists quotes tables metadata and fenced code keep native line geometry", () => {
	const text = [
		"---",
		"title: 测试",
		"---",
		"# 标题",
		"- 列表",
		"> 引用",
		"| A | B |",
		"|---|---|",
		"```md",
		"# 不是标题",
		"```",
		"最后正文",
	].join("\n");

	assert.deepEqual(compact(text), [
		{ kind: "heading", line: 4, first: true, last: true },
		{ kind: "paragraph", line: 12, first: true, last: true },
	]);
});

test("indented continuation text stays structural while the blank edit row remains stable", () => {
	assert.deepEqual(compact("- 项目\n  继续文本\n\n正文"), [
		{ kind: "paragraph", line: 3, first: true, last: true },
		{ kind: "paragraph", line: 4, first: true, last: true },
	]);
});
