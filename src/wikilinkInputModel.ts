export type WikilinkAliasKind = "fullwidth-open" | "fullwidth-close" | "fullwidth-batch";

export interface WikilinkAliasInputPlan {
	from: number;
	to: number;
	insert: string;
	anchor: number;
	kind: WikilinkAliasKind;
}

/**
 * ASCII word, URL and email characters deliberately do not count as a safe
 * boundary. Chinese prose does: it rarely contains spaces, and `提到@项目甲`
 * should be as useful as `mention @Project A` without rewriting `name@host`.
 */
export function isWikilinkMentionBoundary(before: string): boolean {
	if (before.length === 0) return true;
	const characters = Array.from(before);
	const previous = characters[characters.length - 1] ?? "";
	return !/[\p{Script=Latin}\p{N}_./:+!#$%&'*=?^`{|}~@\\-]/u.test(previous);
}

/** Pure input rewrite plan, kept DOM- and CodeMirror-free for regression tests. */
export function planWikilinkAliasInput(
	documentText: string,
	from: number,
	to: number,
	text: string,
): WikilinkAliasInputPlan | null {
	if (from < 0 || to < from || to > documentText.length || text.length === 0) return null;

	const normalized = text.replace(/【【/gu, "[[").replace(/】】/gu, "]]");
	if (normalized !== text) {
		return {
			from,
			to,
			insert: normalized,
			anchor: from + normalized.length,
			kind: "fullwidth-batch",
		};
	}

	if (from === to && from > 0 && text === "【" && documentText.slice(from - 1, from) === "【") {
		return { from: from - 1, to, insert: "[[", anchor: from + 1, kind: "fullwidth-open" };
	}

	if (from === to && from > 0 && text === "】" && documentText.slice(from - 1, from) === "】") {
		return { from: from - 1, to, insert: "]]", anchor: from + 1, kind: "fullwidth-close" };
	}

	return null;
}
