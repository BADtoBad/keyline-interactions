import { localize } from './locale/ui';
import { isWikilinkMentionBoundary } from "./wikilinkInputModel";

export interface MentionSession { from: number; to: number; query: string }
export interface MentionPage { path: string; basename: string; modified: number }
export type MentionDate = "today" | "tomorrow" | "yesterday" | "time";
export const MENTION_DATES: { id: MentionDate; label: string; keywords: string }[] = [
	{ id: "today", label: localize("今天"), keywords: "today 今日 日期 date" },
	{ id: "tomorrow", label: localize("明天"), keywords: "tomorrow 明日 日期 date" },
	{ id: "yesterday", label: localize("昨天"), keywords: "yesterday 昨日 日期 date" },
	{ id: "time", label: localize("当前时间"), keywords: "now time 现在 此刻 时间" },
];

/** Suppress incomplete inline syntax, which parsers may still call plain text. */
export function isMentionTextBoundary(before: string): boolean {
	if (!isWikilinkMentionBoundary(before)) return false;
	let code = 0, brackets = 0, destination = 0, math = false, html = false;
	for (let i = 0; i < before.length; i++) {
		const c = before[i];
		if (c === "\\") { i++; continue; }
		if (c === "`") {
			let count = 1;
			while (before[i + 1] === "`") { count++; i++; }
			if (!code) code = count;
			else if (code === count) code = 0;
			continue;
		}
		if (code) continue;
		if (c === "[") brackets++;
		if (c === "]") brackets = Math.max(0, brackets - 1);
		if (c === "(" && (destination || before[i - 1] === "]")) destination++;
		if (c === ")") destination = Math.max(0, destination - 1);
		if (c === "$") math = !math;
		if (c === "<") html = true;
		if (c === ">") html = false;
	}
	return !code && !brackets && !destination && !math && !html;
}

/** A menu never owns or rewrites text until an explicit choice is committed. */
export function readMentionSession(text: string, from: number, head: number): MentionSession | null {
	if (from < 0 || head <= from || head > text.length || text[from] !== "@") return null;
	const query = text.slice(from + 1, head);
	if (query.length > 120 || /[\r\n@[\]]/u.test(query)) return null;
	return { from, to: head, query };
}

export function mentionMatches(query: string, ...values: string[]): boolean {
	const terms = query.trim().toLocaleLowerCase().split(/\s+/u);
	const haystack = values.join(" ").toLocaleLowerCase();
	return terms.every(term => haystack.includes(term));
}

/** Bounded DOM; enumerate metadata once on open, never read note contents. */
export function findMentionPages(pages: readonly MentionPage[], query: string, limit = 12): MentionPage[] {
	const q = query.trim().toLocaleLowerCase();
	const score = (page: MentionPage): number => page.basename.toLocaleLowerCase() === q ? 0
		: page.basename.toLocaleLowerCase().startsWith(q) ? 1 : 2;
	return pages.filter(page => mentionMatches(query, page.path))
		.sort((a, b) => (q ? score(a) - score(b) : 0) || b.modified - a.modified || a.path.localeCompare(b.path))
		.slice(0, limit);
}

/** Do not manufacture ambiguous links from reserved filename characters. */
export function mentionWikilink(linktext: string): string | null {
	return linktext && !/[[\]|#^\r\n]/u.test(linktext) ? `[[${linktext}]]` : null;
}
