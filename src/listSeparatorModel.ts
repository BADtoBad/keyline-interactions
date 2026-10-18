export type EditableListSeparatorKind = "marker" | "task";

export interface EditableListSeparatorPlan {
	from: number;
	to: number;
	kind: EditableListSeparatorKind;
}

export interface EditableListMarkerRange {
	markerFrom: number;
	markerTo: number;
}

/** Accept stock Lezer node names and Obsidian's runtime token metadata. */
export function isEditableListSyntaxMetadata(metadata: string): boolean {
	const tokens = new Set(metadata.toLowerCase().split(/\s+/u).filter(Boolean));
	return tokens.has("listitem")
		|| tokens.has("bulletlist")
		|| tokens.has("orderedlist")
		|| tokens.has("formatting-list")
		|| tokens.has("formatting-list-ul")
		|| tokens.has("formatting-list-ol");
}

const isSeparator = (value: string | undefined): value is " " | "\t" =>
	value === " " || value === "\t";

const isListMarker = (value: string): boolean =>
	/^[-+*]$/u.test(value) || /^\d{1,9}[.)]$/u.test(value);

/** Locate a line-start list marker without trusting raw text as semantics. */
export function findEditableListMarkerRange(
	lineText: string,
	lineFrom: number
): EditableListMarkerRange | null {
	const match = /^((?: {0,3}>[ \t]?)*[ \t]*)([-+*]|\d{1,9}[.)])(?=[ \t])/u.exec(lineText);
	if (!match) return null;
	const localFrom = match[1].length;
	return {
		markerFrom: lineFrom + localFrom,
		markerTo: lineFrom + localFrom + match[2].length,
	};
}

/**
 * Mark the real Markdown separator that already sits between a native list
 * marker and its label. This keeps the source character and its two caret
 * boundaries intact; CSS may change only that character's advance width.
 *
 * Task lists use the separator after `[ ]` / `[x]`. Extra authored spaces or
 * tabs are deliberately left alone so alignment typed by the user remains
 * visible and editable.
 */
export function planEditableListSeparator(
	lineText: string,
	lineFrom: number,
	markerFrom: number,
	markerTo: number
): EditableListSeparatorPlan | null {
	const localFrom = markerFrom - lineFrom;
	const localTo = markerTo - lineFrom;
	if (
		localFrom < 0
		|| localTo <= localFrom
		|| localTo > lineText.length
		|| !isListMarker(lineText.slice(localFrom, localTo))
		|| !isSeparator(lineText[localTo])
	) return null;

	const afterMarkerSeparator = localTo + 1;
	const task = /^\[[ xX]\](?=[ \t]|$)/u.exec(lineText.slice(afterMarkerSeparator));
	if (task) {
		const afterTask = afterMarkerSeparator + task[0].length;
		if (!isSeparator(lineText[afterTask])) return null;
		return {
			from: lineFrom + afterTask,
			to: lineFrom + afterTask + 1,
			kind: "task",
		};
	}

	return {
		from: markerTo,
		to: markerTo + 1,
		kind: "marker",
	};
}
