import { planStyledBlocks } from "./styledBlockModel";

export type EditorLayoutLineKind = "paragraph" | "heading";

export interface EditorLayoutLinePlan {
	kind: EditorLayoutLineKind;
	lineNumber: number;
	lineFrom: number;
	lineTo: number;
	isFirst: boolean;
	isLast: boolean;
}

export type EditorLayoutGapBefore = "paragraph-before" | "heading-before";
export type EditorLayoutGapAfter = "paragraph-after" | "heading-after";
export type EditorLayoutDirectGap = "paragraph-gap" | "quote-line";

/**
 * A zero-length CodeMirror block widget inserted between text lines.
 *
 * `before` and `after` describe the two block edges meeting at the same
 * boundary. CSS collapses them with `max()` just like ordinary vertical
 * margins, so a Quote followed by prose receives one gap rather than two
 * stacked line paddings. `direct` is used for a source newline inside one
 * content family and therefore bypasses the two outer-edge controls.
 */
export interface EditorLayoutGapPlan {
	at: number;
	side: -1 | 1;
	before?: EditorLayoutGapBefore;
	after?: EditorLayoutGapAfter;
	direct?: EditorLayoutDirectGap;
}

export interface EditorLayoutPresentationPlan {
	lines: EditorLayoutLinePlan[];
	gaps: EditorLayoutGapPlan[];
}

interface SourceLine {
	number: number;
	from: number;
	to: number;
	text: string;
}

type SourceLineKind = "blank" | "paragraph" | "heading" | "quote" | "callout" | "structural";

interface ClassifiedLine extends SourceLine {
	kind: Exclude<SourceLineKind, "blank">;
	isFirst: boolean;
	isLast: boolean;
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

const ATX_HEADING = /^ {0,3}#{1,6}(?:[ \t]+|$)/u;
// A lone `-` (and the intermediate `--`) is also how an unordered list or
// thematic break begins while the user is typing. Treating it immediately as
// a Setext underline swaps paragraph spacing for heading spacing for one
// keystroke. Three hyphens are unambiguous enough for this conservative layout
// planner; equals-style Setext headings do not overlap list input.
const SETEXT_UNDERLINE = /^ {0,3}(?:=+|-{3,})[ \t]*$/u;
const LIST_MARKER = /^ {0,3}(?:[-+*]|\d{1,9}[.)])[ \t]+/u;
const AMBIGUOUS_HYPHEN_BLOCK = /^ {0,3}-{1,2}[ \t]*$/u;
const THEMATIC_BREAK = /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/u;
const FENCE = /^ {0,3}(`{3,}|~{3,})/u;
const LINK_DEFINITION = /^ {0,3}\[(?:\^)?[^\]]+\]:/u;
const TABLE_ROW = /^\s*\|.*\|\s*$/u;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-{3,}:?(?:\s*\|\s*:?-{3,}:?)+\s*\|?\s*$/u;

const classifySourceLines = (text: string): ClassifiedLine[] => {
	const lines = sourceLines(text);
	const setextUnderlines = new Set<number>();
	const styledLines = new Map(
		planStyledBlocks(text).map((line) => [line.lineNumber, line] as const)
	);
	const kinds: SourceLineKind[] = lines.map((line) =>
		line.text.trim().length === 0 ? "blank" : "paragraph"
	);

	// YAML frontmatter exists only when the document starts with `---`.
	if (lines[0]?.text.trim() === "---") {
		kinds[0] = "structural";
		for (let index = 1; index < lines.length; index += 1) {
			kinds[index] = "structural";
			if (/^(?:---|\.\.\.)\s*$/u.test(lines[index].text)) break;
		}
	}

	let fenceCharacter: "`" | "~" | null = null;
	let fenceLength = 0;
	for (let index = 0; index < lines.length; index += 1) {
		if (kinds[index] === "structural") continue;
		const value = lines[index].text;

		if (fenceCharacter !== null) {
			kinds[index] = "structural";
			const close = FENCE.exec(value);
			if (close && close[1][0] === fenceCharacter && close[1].length >= fenceLength) {
				fenceCharacter = null;
				fenceLength = 0;
			}
			continue;
		}

		const open = FENCE.exec(value);
		if (open) {
			kinds[index] = "structural";
			fenceCharacter = open[1][0] as "`" | "~";
			fenceLength = open[1].length;
			continue;
		}

		if (kinds[index] === "blank") continue;
		if (ATX_HEADING.test(value)) {
			kinds[index] = "heading";
			continue;
		}

		if (/^ {0,3}>/u.test(value)) {
			const styledLine = styledLines.get(index + 1);
			kinds[index] = styledLine?.kind ?? "structural";
			continue;
		}

		if (
			/^\s/u.test(value)
			|| LIST_MARKER.test(value)
			|| AMBIGUOUS_HYPHEN_BLOCK.test(value)
			|| THEMATIC_BREAK.test(value)
			|| LINK_DEFINITION.test(value)
			|| TABLE_ROW.test(value)
			|| TABLE_SEPARATOR.test(value)
			|| /^ {0,3}(?:\$\$|<\/?[A-Za-z!])/u.test(value)
		) {
			kinds[index] = "structural";
		}
	}

	// A Setext heading is a two-line heading block. It must be identified after
	// thematic breaks so the same `---` token is interpreted in context.
	for (let index = 1; index < lines.length; index += 1) {
		if (
			SETEXT_UNDERLINE.test(lines[index].text)
			&& kinds[index - 1] === "paragraph"
			&& lines[index - 1].text.trim().length > 0
		) {
			kinds[index - 1] = "heading";
			kinds[index] = "heading";
			setextUnderlines.add(index);
		}
	}

	return lines.map((line, index) => {
		// An editable empty source line is a pending paragraph, not an absence of
		// layout. Giving it the same role before the first glyph is typed keeps
		// both its y-coordinate and its native caret height stable across input.
		const kind: ClassifiedLine["kind"] = kinds[index] === "blank"
			? "paragraph"
			: kinds[index] as ClassifiedLine["kind"];
		if (kind === "quote" || kind === "callout") {
			const styledLine = styledLines.get(line.number);
			return {
				...line,
				kind,
				isFirst: styledLine?.isFirst ?? true,
				isLast: styledLine?.isLast ?? true,
			};
		}

		if (kind === "heading") {
			return {
				...line,
				kind,
				isFirst: !setextUnderlines.has(index),
				isLast: !setextUnderlines.has(index + 1),
			};
		}

		return { ...line, kind, isFirst: true, isLast: true };
	});
};

/**
 * Add stable editor-only line roles for layout settings.
 *
 * Every physical prose source line is an editable paragraph boundary. Visual
 * wraps remain inside one CodeMirror line and therefore never receive another
 * indent or gap. Blank lines retain the pending paragraph role so typing the
 * first character cannot move the caret or change the surrounding rhythm.
 */
const editorLinesFrom = (lines: ClassifiedLine[]): EditorLayoutLinePlan[] =>
	lines
		.filter((line): line is ClassifiedLine & { kind: EditorLayoutLineKind } =>
			line.kind === "paragraph" || line.kind === "heading"
		)
		.map((line) => ({
			kind: line.kind,
			lineNumber: line.number,
			lineFrom: line.from,
			lineTo: line.to,
			isFirst: line.isFirst,
			isLast: line.isLast,
		}));

export const planEditorLayout = (text: string): EditorLayoutLinePlan[] =>
	editorLinesFrom(classifySourceLines(text));

const beforeEdge = (kind: ClassifiedLine["kind"]): EditorLayoutGapBefore | undefined => {
	if (kind === "heading") return "heading-before";
	if (kind === "paragraph" || kind === "quote" || kind === "callout") {
		return "paragraph-before";
	}
	return undefined;
};

const afterEdge = (kind: ClassifiedLine["kind"]): EditorLayoutGapAfter | undefined => {
	if (kind === "heading") return "heading-after";
	if (kind === "paragraph" || kind === "quote" || kind === "callout") {
		return "paragraph-after";
	}
	return undefined;
};

const editorGapsFrom = (lines: ClassifiedLine[]): EditorLayoutGapPlan[] => {
	if (lines.length === 0) return [];

	const result: EditorLayoutGapPlan[] = [];
	const firstBefore = beforeEdge(lines[0].kind);
	if (firstBefore && lines[0].isFirst) {
		result.push({ at: lines[0].from, side: -1, before: firstBefore });
	}

	for (let index = 1; index < lines.length; index += 1) {
		const previous = lines[index - 1];
		const current = lines[index];

		if (previous.kind === "paragraph" && current.kind === "paragraph") {
			result.push({ at: current.from, side: -1, direct: "paragraph-gap" });
			continue;
		}

		if (
			previous.kind === "quote"
			&& current.kind === "quote"
			&& !previous.isLast
			&& !current.isFirst
		) {
			result.push({ at: current.from, side: -1, direct: "quote-line" });
			continue;
		}

		// Setext title + underline and lines inside one callout are composite
		// blocks. Their own presentation owns internal geometry.
		if (!previous.isLast && !current.isFirst && previous.kind === current.kind) continue;

		const after = previous.isLast ? afterEdge(previous.kind) : undefined;
		const before = current.isFirst ? beforeEdge(current.kind) : undefined;
		if (after || before) {
			result.push({ at: current.from, side: -1, after, before });
		}
	}

	const last = lines[lines.length - 1];
	const lastAfter = afterEdge(last.kind);
	if (lastAfter && last.isLast) {
		result.push({ at: last.to, side: 1, after: lastAfter });
	}

	return result;
};

/** Plan vertical space as independent block widgets, never as `.cm-line` box padding. */
export const planEditorLayoutGaps = (text: string): EditorLayoutGapPlan[] =>
	editorGapsFrom(classifySourceLines(text));

/** Parse once for the production editor's line and vertical-layout decorations. */
export const planEditorLayoutPresentation = (text: string): EditorLayoutPresentationPlan => {
	const lines = classifySourceLines(text);
	return {
		lines: editorLinesFrom(lines),
		gaps: editorGapsFrom(lines),
	};
};
