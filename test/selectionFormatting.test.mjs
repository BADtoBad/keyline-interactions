import test from "node:test";
import assert from "node:assert/strict";
import { planInlineColor } from "./.build/selectionFormatting.js";

const BLUE = {
	id: "blue-text",
	tagName: "span",
	style: "color: var(--color-blue);",
};

test("inline colour keeps the visible text selected inside its wrapper", () => {
	const plan = planInlineColor("before blue after", 7, 11, BLUE);
	assert.equal(
		plan.insert,
		'<span data-nmg-color="blue-text" style="color: var(--color-blue);">blue</span>'
	);
	assert.equal(plan.insert.slice(plan.selectionFrom - plan.from, plan.selectionTo - plan.from), "blue");
});

test("choosing another colour replaces our wrapper rather than nesting it", () => {
	const open = '<span data-nmg-color="blue-text" style="color: var(--color-blue);">';
	const text = `${open}blue</span>`;
	const green = { id: "green-text", tagName: "span", style: "color: var(--color-green);" };
	const plan = planInlineColor(text, open.length, open.length + 4, green);
	assert.equal(plan.from, 0);
	assert.equal(plan.to, text.length);
	assert.equal(
		plan.insert,
		'<span data-nmg-color="green-text" style="color: var(--color-green);">blue</span>'
	);
});

test("clear removes only a wrapper written by this plugin", () => {
	const open = '<mark data-nmg-color="yellow-bg" style="background: yellow;">';
	const text = `${open}marked</mark>`;
	const plan = planInlineColor(text, open.length, open.length + 6, null);
	assert.deepEqual(plan, {
		from: 0,
		to: text.length,
		insert: "marked",
		selectionFrom: 0,
		selectionTo: 6,
	});
	assert.equal(planInlineColor("plain", 0, 5, null), null);
});

test("empty selections are left untouched", () => {
	assert.equal(planInlineColor("text", 2, 2, BLUE), null);
});
