/**
 * Tests for handle placement and its hover zone.
 *
 * The rule being protected: the zone is generous on the side the handle is
 * actually rendered on and tight on the other. The old test allowed 100px on
 * both sides, which was simultaneously too mean on the handle's side (a
 * diagonal move from text to handle could leave the zone) and pointless on
 * the side where nothing is drawn.
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
	isInsideHandleZone,
	planHandlePlacement,
	HANDLE_SIDE_SLACK,
	OPPOSITE_SIDE_SLACK,
} from "./.build/handleZone.js";

/** An editor 800px wide with 700px of content inset 50px from its left edge. */
const M = {
	viewWidth: 800,
	viewHeight: 600,
	contentOffsetLeft: 50,
	contentWidth: 700,
};

test("a pointer over the text is inside the zone on either side", () => {
	assert.equal(isInsideHandleZone(M, 400, 300, "left"), true);
	assert.equal(isInsideHandleZone(M, 400, 300, "right"), true);
});

test("the handle's own side allows a wide excursion", () => {
	assert.equal(isInsideHandleZone(M, -HANDLE_SIDE_SLACK, 300, "left"), true);
	assert.equal(isInsideHandleZone(M, -HANDLE_SIDE_SLACK - 1, 300, "left"), false);

	const rightEdge = M.viewWidth + HANDLE_SIDE_SLACK;
	assert.equal(isInsideHandleZone(M, rightEdge, 300, "right"), true);
	assert.equal(isInsideHandleZone(M, rightEdge + 1, 300, "right"), false);
});

test("the opposite side allows only a sliver", () => {
	assert.equal(isInsideHandleZone(M, -OPPOSITE_SIDE_SLACK, 300, "right"), true);
	assert.equal(isInsideHandleZone(M, -OPPOSITE_SIDE_SLACK - 1, 300, "right"), false);

	const rightEdge = M.viewWidth + OPPOSITE_SIDE_SLACK;
	assert.equal(isInsideHandleZone(M, rightEdge, 300, "left"), true);
	assert.equal(isInsideHandleZone(M, rightEdge + 1, 300, "left"), false);
});

test("vertical bounds are the editor's, on both sides", () => {
	for (const side of ["left", "right"]) {
		assert.equal(isInsideHandleZone(M, 400, -1, side), false);
		assert.equal(isInsideHandleZone(M, 400, 0, side), true);
		assert.equal(isInsideHandleZone(M, 400, M.viewHeight, side), true);
		assert.equal(isInsideHandleZone(M, 400, M.viewHeight + 1, side), false);
	}
});

/** Readable line length on: 700px of content centred in a 1400px editor. */
const WIDE = {
	viewWidth: 1400,
	viewHeight: 600,
	contentOffsetLeft: 350,
	contentWidth: 700,
};

for (const side of ["left", "right"]) for (const count of [1, 2, 3]) {
	test(`${side}/${count}: actual button count stays outside text and inside wide pane`, () => {
		const p = planHandlePlacement(WIDE, side, count);
		assert.equal(p.side, side);
		assert.equal(p.width, 28 * count + 2 * (count - 1));
		assert.ok(p.left >= 4 && p.left + p.width <= WIDE.viewWidth - 4);
		assert.ok(side === "left" ? p.left + p.width <= 346 : p.left >= 1054);
	});
}
test("default 72px gutter fits two full controls or three compact controls", () => {
	const m = { ...M, contentOffsetLeft: 72, contentWidth: 656 };
	assert.equal(planHandlePlacement(m, "left", 2).buttonSize, 28);
	assert.deepEqual(planHandlePlacement(m, "left", 3), { left: 4, side: "left", buttonSize: 20, width: 64 });
});
test("50px gutter fits two compact controls, never a clamped-over-text third", () => {
	assert.equal(planHandlePlacement(M, "left", 2).buttonSize, 20);
	assert.equal(planHandlePlacement(M, "left", 3), null);
});
test("uses opposite gutter when preferred side has no room without changing preference", () => {
	const m = { ...M, contentOffsetLeft: 0, contentWidth: 650 };
	assert.equal(planHandlePlacement(m, "left", 3).side, "right");
});
test("zero padding and full width never overlaps text or neighbouring panels", () => {
	for (const side of ["left", "right"]) assert.equal(planHandlePlacement({ ...M, contentOffsetLeft: 0, contentWidth: 800 }, side, 2), null);
});
test("unmeasured content fails closed during initial layout", () => {
	assert.equal(planHandlePlacement({ ...M, contentWidth: 0 }, "left", 2), null);
});
test("horizontal scrolling uses the visible scroller interval", () => {
	const m = { ...WIDE, visibleLeft: 320, visibleWidth: 800 };
	const p = planHandlePlacement(m, "left", 2);
	assert.equal(p.side, "right");
	assert.ok(p.left >= 324 && p.left + p.width <= 1116);
});
test("honours CSS sizes and gaps instead of hard-coding 68px", () => {
	assert.equal(planHandlePlacement(WIDE, "left", 3, 32, 5).width, 106);
});
