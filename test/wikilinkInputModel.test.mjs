import test from "node:test";
import assert from "node:assert/strict";
import {
	isWikilinkMentionBoundary,
	planWikilinkAliasInput,
} from "./.build/wikilinkInputModel.js";

test("@ never rewrites document text; the separate menu requires explicit choice", () => {
	for (const before of ["", "参见", "mention "]) {
		assert.equal(planWikilinkAliasInput(before, before.length, before.length, "@"), null);
	}
});

test("@ inside an email, URL or identifier remains literal", () => {
	for (const before of ["name", "https://host/", "user_name", "v1.2", "path+"]) {
		assert.equal(planWikilinkAliasInput(before, before.length, before.length, "@"), null);
	}
	assert.equal(isWikilinkMentionBoundary("中文"), true);
	assert.equal(isWikilinkMentionBoundary("name"), false);
});

test("a typed fullwidth opening pair becomes [[ on the second bracket", () => {
	assert.deepEqual(planWikilinkAliasInput("【", 1, 1, "【"), {
		from: 0,
		to: 1,
		insert: "[[",
		anchor: 2,
		kind: "fullwidth-open",
	});
});

test("a typed fullwidth closing pair becomes ]] on the second bracket", () => {
	assert.deepEqual(planWikilinkAliasInput("[[项目】", 5, 5, "】"), {
		from: 4,
		to: 5,
		insert: "]]",
		anchor: 6,
		kind: "fullwidth-close",
	});
});

test("IME-sized fullwidth pairs normalize in one input change", () => {
	assert.deepEqual(planWikilinkAliasInput("", 0, 0, "【【项目】】"), {
		from: 0,
		to: 0,
		insert: "[[项目]]",
		anchor: 6,
		kind: "fullwidth-batch",
	});
});

test("single fullwidth brackets remain ordinary punctuation", () => {
	assert.equal(planWikilinkAliasInput("", 0, 0, "【"), null);
	assert.equal(planWikilinkAliasInput("文本", 2, 2, "】"), null);
});
