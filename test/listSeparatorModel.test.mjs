import test from "node:test";
import assert from "node:assert/strict";
import { parser } from "@lezer/markdown";
import {
	findEditableListMarkerRange,
	isEditableListSyntaxMetadata,
	planEditableListSeparator,
} from "./.build/listSeparatorModel.js";

test("accepts stock and Obsidian list metadata only", () => {
	for (const metadata of [
		"ListItem",
		"BulletList",
		"OrderedList",
		"ListMark formatting formatting-list formatting-list-ul",
		"list-marker formatting-list-ol",
	]) assert.equal(isEditableListSyntaxMetadata(metadata), true, metadata);
	for (const metadata of ["Paragraph", "CodeMark formatting-code", "frontmatter"]) {
		assert.equal(isEditableListSyntaxMetadata(metadata), false, metadata);
	}
});

test("locates real unordered, ordered, nested and quoted marker offsets", () => {
	assert.deepEqual(findEditableListMarkerRange("- 正文", 30), {
		markerFrom: 30,
		markerTo: 31,
	});
	assert.deepEqual(findEditableListMarkerRange("\t12) 二级", 100), {
		markerFrom: 101,
		markerTo: 104,
	});
	assert.deepEqual(findEditableListMarkerRange("> >   * 引用列表", 0), {
		markerFrom: 6,
		markerTo: 7,
	});
	assert.equal(findEditableListMarkerRange("-", 0), null);
});

test("marks the required ordinary separator without replacing it", () => {
	assert.deepEqual(planEditableListSeparator("- 正文", 20, 20, 21), {
		from: 21,
		to: 22,
		kind: "marker",
	});
	assert.deepEqual(planEditableListSeparator("  12) 正文", 40, 42, 45), {
		from: 45,
		to: 46,
		kind: "marker",
	});
});

test("marks only the first separator and preserves authored alignment", () => {
	assert.deepEqual(planEditableListSeparator("-   正文", 0, 0, 1), {
		from: 1,
		to: 2,
		kind: "marker",
	});
	assert.deepEqual(planEditableListSeparator("-\t\t正文", 0, 0, 1), {
		from: 1,
		to: 2,
		kind: "marker",
	});
});

test("task lists assign the separator after the native checkbox source", () => {
	assert.deepEqual(planEditableListSeparator("- [x] 已完成", 100, 100, 101), {
		from: 105,
		to: 106,
		kind: "task",
	});
	assert.deepEqual(planEditableListSeparator("* [ ]\t待办", 0, 0, 1), {
		from: 5,
		to: 6,
		kind: "task",
	});
});

test("empty ordinary items retain a real coordinate-bearing separator", () => {
	assert.deepEqual(planEditableListSeparator("- ", 0, 0, 1), {
		from: 1,
		to: 2,
		kind: "marker",
	});
});

test("fails closed for malformed ranges and non-list source", () => {
	assert.equal(planEditableListSeparator("paragraph ", 0, 0, 1), null);
	assert.equal(planEditableListSeparator("1234567890. x", 0, 0, 11), null);
	assert.equal(planEditableListSeparator("-x", 0, 0, 1), null);
	assert.deepEqual(planEditableListSeparator("- [ ]text", 0, 0, 1), {
		from: 1,
		to: 2,
		kind: "marker",
	});
});

test("plans separators from the parser's real ListMark ranges", () => {
	const source = "- 一级\n  1. 二级\n- [ ] 待办";
	const plans = [];
	parser.parse(source).iterate({
		enter(node) {
			if (node.name !== "ListMark") return;
			const lineFrom = source.lastIndexOf("\n", node.from - 1) + 1;
			const lineEnd = source.indexOf("\n", node.to);
			const lineText = source.slice(lineFrom, lineEnd < 0 ? source.length : lineEnd);
			const plan = planEditableListSeparator(lineText, lineFrom, node.from, node.to);
			if (plan) plans.push(plan);
		},
	});
	assert.deepEqual(plans, [
		{ from: 1, to: 2, kind: "marker" },
		{ from: 9, to: 10, kind: "marker" },
		{ from: 18, to: 19, kind: "task" },
	]);
});
