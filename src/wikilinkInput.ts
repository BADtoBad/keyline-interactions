import { syntaxTree } from "@codemirror/language";
import { Extension, Prec, Transaction } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";
import type NotionBlock from "./main";
import { isInsideCodeFence } from "./codeFence";
import { planWikilinkAliasInput } from "./wikilinkInputModel";

const PROTECTED_CONTEXT = /(?:code|url|link|frontmatter|html|math|comment)/iu;

export function isProtectedMarkdownContext(view: EditorView, position: number): boolean {
	const line = view.state.doc.lineAt(position);
	if (isInsideCodeFence(view.state.doc, line.number)) return true;

	// Keep literal/code/link data literal. At an exact node boundary the caret
	// is allowed to continue writing normally after the node.
	let node: SyntaxNode | null = syntaxTree(view.state).resolveInner(position, -1);
	while (node) {
		if (node.from < position && position < node.to && PROTECTED_CONTEXT.test(node.name)) return true;
		node = node.parent;
	}
	return false;
}

/**
 * Adds keyboard aliases while delegating the actual link experience to core.
 * The dispatched transaction is still `input.type`, which is the signal the
 * native Wikilink suggester already follows.
 */
export const wikilinkInputExtension = (plugin: NotionBlock): Extension =>
	Prec.highest(EditorView.inputHandler.of((view, from, to, text, insert) => {
		if (!plugin.settings.enabled || !plugin.settings.wikilinkInputAliases) return false;
		if (view.state.selection.ranges.length !== 1) return false;

		const defaultTransaction = insert();
		const userEvent = defaultTransaction.annotation(Transaction.userEvent);
		if (!userEvent?.startsWith("input.type")) return false;
		if (isProtectedMarkdownContext(view, from)) return false;

		const plan = planWikilinkAliasInput(view.state.doc.toString(), from, to, text);
		if (!plan) return false;

		view.dispatch({
			changes: { from: plan.from, to: plan.to, insert: plan.insert },
			selection: { anchor: plan.anchor },
			scrollIntoView: true,
			userEvent,
		});
		return true;
	}));
