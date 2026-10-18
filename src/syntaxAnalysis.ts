import { localize } from './locale/ui';
import type { NodeProp, Tree } from "@lezer/common";
import * as cmLanguage from "@codemirror/language";

// Obsidian exposes this CodeMirror compatibility property at runtime, but the
// current public @codemirror/language typings no longer declare it. Keep the
// cast narrow and optional so stock Lezer tests still run without the patch.
const obsidianTokenClassNodeProp = (cmLanguage as unknown as {
	tokenClassNodeProp?: NodeProp<string>;
}).tokenClassNodeProp;

export interface TextRange {
	from: number;
	to: number;
}

export interface SuspiciousMarker extends TextRange {
	marker: string;
	message: string;
}

export interface MarkdownSyntaxSummary {
	/** Parser-confirmed markers that can be concealed in Live Preview. */
	hidden: TextRange[];
	/** Parser-confirmed paired markers used to distinguish syntax from literals. */
	recognized: TextRange[];
	/** Literal-looking regions where delimiter characters are data, not Markdown. */
	ignored: TextRange[];
}

const GUARDED_MARKER = /(?:\*{2,}|_{2,}|~{2,}|`+)/g;

export type MarkdownMarkerKind = "emphasis" | "strikethrough" | "highlight" | "code" | "heading";

/**
 * Obsidian's Markdown parser exposes most semantics through tokenClassNodeProp,
 * not through the Lezer node name used by the stock @lezer/markdown parser.
 * The combined metadata is accepted here so both trees share one boundary.
 */
export function markdownMarkerKind(
	metadata: string,
	parentMetadata: string | null = null
): MarkdownMarkerKind | null {
	const lower = metadata.toLowerCase();
	const nodeName = metadata.split(/\s+/, 1)[0];
	const parent = parentMetadata?.split(/\s+/, 1)[0].toLowerCase() ?? "";

	if (nodeName === "EmphasisMark") {
		return parent === "emphasis" || parent === "strongemphasis" ? "emphasis" : null;
	}
	if (nodeName === "StrikethroughMark") {
		return parent === "strikethrough" ? "strikethrough" : null;
	}
	if (nodeName === "HighlightMark") return parent === "highlight" ? "highlight" : null;
	if (nodeName === "CodeMark") return parent === "inlinecode" ? "code" : null;
	if (nodeName === "HeaderMark") return parent.startsWith("atxheading") ? "heading" : null;

	// Obsidian examples include metadata such as
	// "strong formatting formatting-strong" and
	// "header-2 formatting formatting-header".
	if (lower.includes("formatting-strong") || lower.includes("formatting-em")) {
		return "emphasis";
	}
	if (lower.includes("formatting-strikethrough")) return "strikethrough";
	if (lower.includes("formatting-highlight")) return "highlight";
	if (lower.includes("formatting-code") && !lower.includes("codeblock")) return "code";
	if (lower.includes("formatting-header") || lower.includes("formatting-heading")) {
		return "heading";
	}
	return null;
}

function isIgnoredContext(metadata: string): boolean {
	const lower = metadata.toLowerCase();
	return metadata === "HorizontalRule"
		|| metadata === "FencedCode"
		|| metadata === "CodeBlock"
		|| metadata === "InlineCode"
		|| metadata === "HTMLTag"
		|| metadata === "HTMLBlock"
		|| metadata === "URL"
		|| isEscapeContext(metadata)
		|| lower.split(/\s+/).includes("hr")
		|| lower.includes("hmd-codeblock")
		|| lower.includes("code-block")
		|| lower.includes("inline-code")
		|| lower.includes("link")
		|| lower.includes("url")
		|| lower.includes("frontmatter")
		|| lower.includes("comment")
		|| lower.includes("math");
}

/**
 * A backslash is presentational syntax only when the Markdown parser accepts
 * it as an escape. Obsidian may expose that fact through either the stock
 * `Escape` node name or a formatting token class.
 */
function isEscapeContext(metadata: string): boolean {
	const tokens = metadata.toLowerCase().split(/\s+/);
	return tokens.includes("escape")
		|| tokens.includes("formatting-escape")
		|| tokens.includes("hmd-escape");
}

export function mergeRanges(ranges: readonly TextRange[]): TextRange[] {
	const sorted = ranges
		.filter((range) => range.to > range.from)
		.map((range) => ({ from: range.from, to: range.to }))
		.sort((a, b) => a.from - b.from || a.to - b.to);

	const merged: TextRange[] = [];
	for (const range of sorted) {
		const previous = merged[merged.length - 1];
		if (!previous || range.from > previous.to) {
			merged.push(range);
		} else if (range.to > previous.to) {
			previous.to = range.to;
		}
	}
	return merged;
}

/**
 * Read the same Lezer tree Obsidian uses for Live Preview.
 *
 * This is the core safety boundary: a marker is concealable only when the
 * Markdown parser emitted a marker node for it. Raw token counting is never
 * used to decide what disappears, so an invalid `**` stays on screen.
 */
export function collectMarkdownSyntax(tree: Tree, text?: string): MarkdownSyntaxSummary {
	const hidden: TextRange[] = [];
	const recognized: TextRange[] = [];
	const ignored: TextRange[] = [];
	const ownColorTags: Array<{ tagName: "span" | "mark"; range: TextRange }> = [];
	const cursor = tree.cursor();

	const visit = (parentMetadata: string | null): void => {
		const name = cursor.name;
		const tokenClasses = obsidianTokenClassNodeProp
			? cursor.type.prop(obsidianTokenClassNodeProp) ?? ""
			: "";
		const metadata = tokenClasses ? `${name} ${tokenClasses}` : name;
		const range = { from: cursor.from, to: cursor.to };
		const markerKind = markdownMarkerKind(metadata, parentMetadata);
		const source = text?.slice(range.from, range.to) ?? "";
		const escapedBackslash = isEscapeContext(metadata) && source.startsWith("\\")
			? { from: range.from, to: Math.min(range.from + 1, range.to) }
			: null;

		if (markerKind && markerKind !== "heading") recognized.push(range);
		if (markerKind) hidden.push(range);
		if (escapedBackslash) hidden.push(escapedBackslash);
		if (isIgnoredContext(metadata)) ignored.push(range);

		// Inline colours require HTML because Markdown has no colour syntax. Hide
		// only the tags this plugin wrote, and only after an actual matching close
		// tag is found. Ordinary user-authored HTML always remains editable.
		if (name === "HTMLTag" && source) {
			const open = source.match(/^<(span|mark)\s+data-nmg-color="[a-z-]+"\s+style="[^"]*">$/u);
			if (open && (open[1] === "span" || open[1] === "mark")) {
				ownColorTags.push({ tagName: open[1], range });
			} else {
				const close = source.match(/^<\/(span|mark)>$/u);
				if (close && (close[1] === "span" || close[1] === "mark")) {
					for (let index = ownColorTags.length - 1; index >= 0; index -= 1) {
						const candidate = ownColorTags[index];
						if (candidate.tagName !== close[1]) continue;
						hidden.push(candidate.range, range);
						ownColorTags.splice(index, 1);
						break;
					}
				}
			}
		}

		if (cursor.firstChild()) {
			do {
				visit(metadata);
			} while (cursor.nextSibling());
			cursor.parent();
		}
	};

	visit(null);
	return {
		hidden: mergeRanges(hidden),
		recognized: mergeRanges(recognized),
		ignored: mergeRanges(ignored),
	};
}

function rangeIsCovered(range: TextRange, safeRanges: readonly TextRange[]): boolean {
	for (const safe of safeRanges) {
		if (safe.from > range.from) return false;
		if (safe.from <= range.from && safe.to >= range.to) return true;
	}
	return false;
}

function rangeIntersectsAny(range: TextRange, filters: readonly TextRange[]): boolean {
	return filters.some((filter) => range.from < filter.to && range.to > filter.from);
}

function messageFor(marker: string): string {
	if (marker.startsWith("`")) {
		return localize("这个反引号没有被 Markdown 解析为有效的行内代码或代码围栏");
	}
	if (marker.startsWith("~")) {
		return localize("这个删除线符号没有被 Markdown 解析为有效配对");
	}
	return localize("这个强调符号没有被 Markdown 解析为有效配对，可能会与更远处的符号串联");
}

/**
 * Find delimiter runs that look like authoring syntax but the parser did not
 * accept. Single `*` and `_` are deliberately excluded to avoid flagging
 * multiplication, ordinary underscores, and prose punctuation.
 */
export function findSuspiciousMarkers(
	text: string,
	summary: MarkdownSyntaxSummary,
	searchRanges?: readonly TextRange[]
): SuspiciousMarker[] {
	const safeRanges = mergeRanges([...summary.recognized, ...summary.ignored]);
	const warnings: SuspiciousMarker[] = [];
	GUARDED_MARKER.lastIndex = 0;

	let match: RegExpExecArray | null;
	while ((match = GUARDED_MARKER.exec(text)) !== null) {
		const range = { from: match.index, to: match.index + match[0].length };
		if (searchRanges && !rangeIntersectsAny(range, searchRanges)) continue;
		if (rangeIsCovered(range, safeRanges)) continue;
		warnings.push({
			...range,
			marker: match[0],
			message: messageFor(match[0]),
		});
	}

	return warnings;
}

export function nextSuspiciousMarker(
	warnings: readonly SuspiciousMarker[],
	position: number
): SuspiciousMarker | null {
	if (warnings.length === 0) return null;
	return warnings.find((warning) => warning.from > position) ?? warnings[0];
}
