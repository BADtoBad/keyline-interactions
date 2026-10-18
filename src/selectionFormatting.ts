export interface InlineColorStyle {
	id: string;
	tagName: "span" | "mark";
	style: string;
}

export interface InlineColorPlan {
	from: number;
	to: number;
	insert: string;
	selectionFrom: number;
	selectionTo: number;
}

interface OwnWrapper {
	from: number;
	to: number;
	tagName: "span" | "mark";
}

const OWN_OPEN_AT_END = /<(span|mark) data-nmg-color="[a-z-]+" style="[^"]*">$/u;

/**
 * Finds a colour wrapper written by this plugin immediately around a
 * selection. Third-party HTML is deliberately left alone.
 */
function surroundingOwnWrapper(documentText: string, from: number, to: number): OwnWrapper | null {
	const open = documentText.slice(0, from).match(OWN_OPEN_AT_END);
	if (!open || (open[1] !== "span" && open[1] !== "mark")) return null;
	const close = `</${open[1]}>`;
	if (!documentText.startsWith(close, to)) return null;
	return {
		from: from - open[0].length,
		to: to + close.length,
		tagName: open[1],
	};
}

/**
 * Plans one reversible inline-colour edit while keeping the visible text
 * selected. Choosing another colour replaces our surrounding wrapper rather
 * than nesting another span. Passing null removes our wrapper.
 */
export function planInlineColor(
	documentText: string,
	from: number,
	to: number,
	color: InlineColorStyle | null
): InlineColorPlan | null {
	if (to <= from) return null;
	const selectedText = documentText.slice(from, to);
	const wrapper = surroundingOwnWrapper(documentText, from, to);
	const changeFrom = wrapper?.from ?? from;
	const changeTo = wrapper?.to ?? to;

	if (color === null) {
		if (!wrapper) return null;
		return {
			from: changeFrom,
			to: changeTo,
			insert: selectedText,
			selectionFrom: changeFrom,
			selectionTo: changeFrom + selectedText.length,
		};
	}

	const openTag = `<${color.tagName} data-nmg-color="${color.id}" style="${color.style}">`;
	const closeTag = `</${color.tagName}>`;
	return {
		from: changeFrom,
		to: changeTo,
		insert: `${openTag}${selectedText}${closeTag}`,
		selectionFrom: changeFrom + openTag.length,
		selectionTo: changeFrom + openTag.length + selectedText.length,
	};
}
