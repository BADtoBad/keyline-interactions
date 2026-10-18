import { localize } from './locale/ui';
import { ensureSyntaxTree } from "@codemirror/language";
import type { EditorState, Range } from "@codemirror/state";
import {
	Decoration,
	type DecorationSet,
	EditorView,
	ViewPlugin,
	type ViewUpdate,
} from "@codemirror/view";
import { Notice } from "obsidian";
import type NotionBlock from "./main";
import {
	collectMarkdownSyntax,
	findSuspiciousMarkers,
	type SuspiciousMarker,
	type TextRange,
} from "./syntaxAnalysis";

const hiddenMarker = Decoration.replace({});

const intersects = (left: TextRange, right: TextRange): boolean =>
	left.from < right.to && left.to > right.from;

interface Presentation {
	decorations: DecorationSet;
	atomic: DecorationSet;
	warnings: SuspiciousMarker[];
}

const EMPTY_PRESENTATION: Presentation = {
	decorations: Decoration.none,
	atomic: Decoration.none,
	warnings: [],
};

/**
 * Build the editor presentation from Obsidian's own Lezer syntax tree.
 *
 * Raw delimiter matching is intentionally never allowed to hide text. A run
 * such as `**` disappears only when the parser emitted the corresponding
 * EmphasisMark node. If parsing has not caught up with the visible viewport,
 * the safe fallback is to show ordinary Markdown until it has.
 */
function buildPresentation(view: EditorView, plugin: NotionBlock): Presentation {
	if (!plugin.settings.enabled) return EMPTY_PRESENTATION;

	const parsedThrough = Math.max(...view.visibleRanges.map((range) => range.to));
	const tree = ensureSyntaxTree(view.state, parsedThrough, 50);
	if (!tree) return EMPTY_PRESENTATION;

	const documentText = view.state.doc.toString();
	const summary = collectMarkdownSyntax(tree, documentText);
	const visible = view.visibleRanges.map(({ from, to }) => ({ from, to }));
	const hidden = plugin.settings.hideSyntaxMarkers && !plugin.syntaxRevealActive
		? summary.hidden.filter((range) => visible.some((part) => intersects(range, part)))
		: [];
	const warnings = plugin.settings.guardSuspiciousSyntax
		? findSuspiciousMarkers(documentText, summary, visible)
		: [];

	const decorationRanges: Range<Decoration>[] = [];
	const atomicRanges: Range<Decoration>[] = [];
	for (const range of hidden) {
		decorationRanges.push(hiddenMarker.range(range.from, range.to));
		atomicRanges.push(hiddenMarker.range(range.from, range.to));
	}
	for (const warning of warnings) {
		decorationRanges.push(Decoration.mark({
			class: "nmg-suspicious-marker",
			attributes: {
				title: warning.message,
				"aria-label": warning.message,
			},
		}).range(warning.from, warning.to));
	}

	return {
		decorations: Decoration.set(decorationRanges, true),
		atomic: Decoration.set(atomicRanges, true),
		warnings,
	};
}

/**
 * Full-document analysis for commands. Returning null is deliberate: warning
 * about an unparsed part of a long note would be worse than asking the user to
 * wait for the syntax tree to finish.
 */
export function findAllSuspiciousMarkers(state: EditorState): SuspiciousMarker[] | null {
	const tree = ensureSyntaxTree(state, state.doc.length, 300);
	if (!tree) return null;
	const documentText = state.doc.toString();
	const summary = collectMarkdownSyntax(tree, documentText);
	return findSuspiciousMarkers(documentText, summary);
}

export function hideSyntaxExtension(plugin: NotionBlock) {
	const presentationPlugin = ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;
			atomic: DecorationSet;
			private generation: number;

			constructor(view: EditorView) {
				const presentation = buildPresentation(view, plugin);
				this.decorations = presentation.decorations;
				this.atomic = presentation.atomic;
				this.generation = plugin.syntaxPresentationGeneration;
			}

			update(update: ViewUpdate): void {
				const generationChanged = this.generation !== plugin.syntaxPresentationGeneration;
				const shouldRebuild = generationChanged
					|| update.docChanged
					|| update.viewportChanged
					|| update.selectionSet
					|| update.transactions.length > 0;
				if (!shouldRebuild) return;

				const presentation = buildPresentation(update.view, plugin);
				this.decorations = presentation.decorations;
				this.atomic = presentation.atomic;
				this.generation = plugin.syntaxPresentationGeneration;

				const pasted = update.transactions.some((transaction) =>
					transaction.isUserEvent("input.paste")
				);
				const pastedRanges: TextRange[] = [];
				if (pasted) {
					update.changes.iterChanges((_fromA, _toA, fromB, toB, inserted) => {
						if (inserted.length > 0) pastedRanges.push({ from: fromB, to: toB });
					});
				}
				const pastedWarnings = presentation.warnings.filter((warning) =>
					pastedRanges.some((range) => intersects(warning, range))
				);
				if (plugin.settings.notifyOnPaste && pastedWarnings.length > 0) {
					new Notice(
						localize`粘贴内容中检测到 ${pastedWarnings.length} 个可疑 Markdown 符号；已保留并标出。`
					);
				}
			}
		},
		{ decorations: (value) => value.decorations }
	);

	return [
		presentationPlugin,
		EditorView.atomicRanges.of((view) =>
			view.plugin(presentationPlugin)?.atomic ?? Decoration.none
		),
	];
}
