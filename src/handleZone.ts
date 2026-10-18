/**
 * Where the block handle sits, and how far the pointer may stray before it
 * counts as having left.
 *
 * WHY THIS IS ITS OWN MODULE
 * Both decisions used to be literals inside blockHandles.ts: a symmetric
 * `x < -100 || x > viewWidth + 100` test and a hard-coded `- 52` offset.
 * Neither could be tested without an editor, and neither knew which side the
 * handle was actually drawn on. Pulling them out makes the geometry testable
 * and makes the side a parameter rather than an assumption.
 *
 * Pure. See test/handleZone.test.mjs.
 */

export type HandleSide = "left" | "right";

/**
 * Editor geometry the placement needs. A subset of blockHandles' own Metrics,
 * named separately so this module does not depend on the view.
 */
export interface ZoneMetrics {
	viewWidth: number;
	viewHeight: number;
	/** Offset of the content inside the scroller. */
	contentOffsetLeft: number;
	contentWidth: number;
	/** Visible scroller interval, in scroll-content coordinates. */
	visibleLeft?: number;
	visibleWidth?: number;
}

/** Keep both the card edge and the editable text clear of pointer targets. */
export const HANDLE_EDGE_GAP = 4;
export const HANDLE_TEXT_GAP = 4;

/**
 * How far past the editor's edge the pointer may stray on the handle's side.
 */
export const HANDLE_SIDE_SLACK = 160;

/**
 * The same allowance on the side with no handle on it.
 *
 * Small but not zero: a pointer skimming the far margin is still reading the
 * line it is beside, and hiding the handle there would be a flicker.
 */
export const OPPOSITE_SIDE_SLACK = 20;

/** True while the pointer is close enough for the handle to stay up. */
export function isInsideHandleZone(
	m: ZoneMetrics,
	x: number,
	y: number,
	side: HandleSide
): boolean {
	if (y < 0 || y > m.viewHeight) return false;

	const leftSlack = side === "left" ? HANDLE_SIDE_SLACK : OPPOSITE_SIDE_SLACK;
	const rightSlack = side === "right" ? HANDLE_SIDE_SLACK : OPPOSITE_SIDE_SLACK;

	return x >= -leftSlack && x <= m.viewWidth + rightSlack;
}

/**
 * Use the visible buttons and CSS dimensions, not the old fixed 76px offset.
 * Prefer the configured gutter, compact to 20px hit targets if necessary,
 * then try the opposite gutter. The saved preference is never rewritten.
 */
export function planHandlePlacement(
	m: ZoneMetrics,
	preferredSide: HandleSide,
	buttonCount: number,
	buttonSize = 28,
	gap = 2,
): { left: number; side: HandleSide; buttonSize: number; width: number } | null {
	if (m.contentWidth <= 0 || buttonCount < 1) return null;
	const start = (m.visibleLeft ?? 0) + HANDLE_EDGE_GAP;
	const end = (m.visibleLeft ?? 0) + (m.visibleWidth ?? m.viewWidth) - HANDLE_EDGE_GAP;
	const other = preferredSide === "left" ? "right" : "left";
	for (const side of [preferredSide, other] as const) {
		for (const size of [buttonSize, Math.min(buttonSize, 20)]) {
			const width = buttonCount * size + Math.max(0, buttonCount - 1) * gap;
			const left = side === "left"
				? m.contentOffsetLeft - HANDLE_TEXT_GAP - width
				: m.contentOffsetLeft + m.contentWidth + HANDLE_TEXT_GAP;
			if (left >= start && left + width <= end) return { left, side, buttonSize: size, width };
		}
	}
	// Never clamp onto text or into the neighbouring pane. Context menus and
	// commands remain available when neither gutter can hold the floating row.
	return null;
}
