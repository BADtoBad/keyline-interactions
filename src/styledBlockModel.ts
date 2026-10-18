export type StyledBlockKind = "callout" | "quote";

export interface StyledBlockLinePlan {
	kind: StyledBlockKind;
	lineNumber: number;
	lineFrom: number;
	lineTo: number;
	markerFrom: number;
	markerTo: number;
	isFirst: boolean;
	isLast: boolean;
	calloutType?: string;
	headerFrom?: number;
	headerTo?: number;
	hasExplicitTitle?: boolean;
}

interface SourceLine {
	number: number;
	from: number;
	to: number;
	text: string;
}

interface QuoteLine extends SourceLine {
	markerFrom: number;
	markerTo: number;
	contentFrom: number;
	content: string;
}

interface CalloutHeader {
	type: string;
	from: number;
	to: number;
	hasExplicitTitle: boolean;
}

const sourceLines = (text: string): SourceLine[] => {
	const lines = text.split("\n");
	let from = 0;
	return lines.map((line, index) => {
		const result = {
			number: index + 1,
			from,
			to: from + line.length,
			text: line,
		};
		from = result.to + 1;
		return result;
	});
};

/**
 * Parse one ordinary, single-depth Markdown quote line.
 *
 * Nested `>>` blocks deliberately fail closed. Hiding only their outer marker
 * would make the remaining source look like accidental punctuation and would
 * misrepresent the actual Markdown hierarchy.
 */
const quoteLine = (line: SourceLine): QuoteLine | null => {
	const match = /^(\s*)>([ \t]*)(.*)$/u.exec(line.text);
	if (!match || match[3].startsWith(">")) return null;

	const markerFrom = line.from + match[1].length;
	// CommonMark treats one space after `>` as marker padding. In ordinary
	// prose, two or three spaces are also almost always accidental input (and
	// Obsidian's own command can produce two), so normalize those visually while
	// preserving the stored source. Four-or-more spaces and tabs can carry code
	// indentation, so only their first marker-padding character is hidden.
	const padding = match[2];
	const hiddenPadding = !padding.includes("\t") && padding.length <= 3
		? padding.length
		: Math.min(1, padding.length);
	const markerTo = markerFrom + 1 + hiddenPadding;
	return {
		...line,
		markerFrom,
		markerTo,
		contentFrom: markerTo,
		content: line.text.slice(markerTo - line.from),
	};
};

const calloutHeader = (line: QuoteLine): CalloutHeader | null => {
	const match = /^\[!([A-Za-z0-9_-]+)\]([+-]?)([ \t]*)(.*)$/u.exec(line.content);
	if (!match) return null;

	const markerText = `[!${match[1]}]${match[2]}${match[3]}`;
	return {
		type: match[1].toLocaleLowerCase("en-US"),
		from: line.contentFrom,
		to: line.contentFrom + markerText.length,
		hasExplicitTitle: match[4].trim().length > 0,
	};
};

/**
 * Plan the reversible visual treatment for plain quotes and callouts.
 *
 * This function changes no text. It only identifies line classes and the two
 * syntax ranges that a CodeMirror presentation layer may replace: the quote
 * prefix and, for callout headers, `[!type]`. A malformed or nested construct
 * remains ordinary visible Markdown.
 */
export const planStyledBlocks = (text: string): StyledBlockLinePlan[] => {
	const parsed = sourceLines(text).map(quoteLine);
	const result: StyledBlockLinePlan[] = [];

	for (let index = 0; index < parsed.length;) {
		const first = parsed[index];
		if (!first) {
			index += 1;
			continue;
		}

		const header = calloutHeader(first);
		const kind: StyledBlockKind = header ? "callout" : "quote";
		let end = index + 1;
		while (end < parsed.length && parsed[end]) {
			// A callout header starts a new visual block even when the author did
			// not put a blank line before it.
			if (!header && calloutHeader(parsed[end] as QuoteLine)) break;
			end += 1;
		}

		for (let cursor = index; cursor < end; cursor += 1) {
			const line = parsed[cursor] as QuoteLine;
			const isFirst = cursor === index;
			const plan: StyledBlockLinePlan = {
				kind,
				lineNumber: line.number,
				lineFrom: line.from,
				lineTo: line.to,
				markerFrom: line.markerFrom,
				markerTo: line.markerTo,
				isFirst,
				isLast: cursor === end - 1,
			};
			if (header) {
				plan.calloutType = header.type;
				if (isFirst) {
					plan.headerFrom = header.from;
					plan.headerTo = header.to;
					plan.hasExplicitTitle = header.hasExplicitTitle;
				}
			}
			result.push(plan);
		}

		index = end;
	}

	return result;
};
