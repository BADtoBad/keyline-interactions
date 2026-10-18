import { ensureSyntaxTree } from "@codemirror/language";
import * as cmLanguage from "@codemirror/language";
import type { Range } from "@codemirror/state";
import type { NodeProp, SyntaxNode } from "@lezer/common";
import {
	Decoration,
	type DecorationSet,
	EditorView,
	ViewPlugin,
	type ViewUpdate,
} from "@codemirror/view";
import { editorLivePreviewField } from "obsidian";
import type NotionBlock from "./main";
import {
	findEditableListMarkerRange,
	isEditableListSyntaxMetadata,
	planEditableListSeparator,
} from "./listSeparatorModel";

const markerSeparator = Decoration.mark({
	class: "ncl-editor-list-separator is-marker",
});
const taskSeparator = Decoration.mark({
	class: "ncl-editor-list-separator is-task",
});

// Obsidian supplies this compatibility node property at runtime even though
// the public @codemirror/language typings no longer expose it.
const obsidianTokenClassNodeProp = (cmLanguage as unknown as {
	tokenClassNodeProp?: NodeProp<string>;
}).tokenClassNodeProp;

interface ListSeparatorPresentation {
	decorations: DecorationSet;
	parseReady: boolean;
}

const EMPTY_PRESENTATION: ListSeparatorPresentation = {
	decorations: Decoration.none,
	parseReady: true,
};

const buildDecorations = (
	view: EditorView,
	plugin: NotionBlock
): ListSeparatorPresentation => {
	if (!plugin.settings.enabled || !view.state.field(editorLivePreviewField, false)) {
		return EMPTY_PRESENTATION;
	}

	const parsedThrough = Math.max(...view.visibleRanges.map(({ to }) => to));
	const tree = ensureSyntaxTree(view.state, parsedThrough, 50);
	if (!tree) return { decorations: Decoration.none, parseReady: false };

	const ranges: Range<Decoration>[] = [];
	const seenLines = new Set<number>();
	for (const visible of view.visibleRanges) {
		const firstLine = view.state.doc.lineAt(visible.from).number;
		const lastLine = view.state.doc.lineAt(visible.to).number;
		for (let lineNumber = firstLine; lineNumber <= lastLine; lineNumber += 1) {
			if (seenLines.has(lineNumber)) continue;
			seenLines.add(lineNumber);
			const line = view.state.doc.line(lineNumber);
			const marker = findEditableListMarkerRange(line.text, line.from);
			if (!marker) continue;

			// Raw marker-shaped text is not enough. A parser-confirmed list ancestor
			// prevents code, frontmatter and literal examples from acquiring layout.
			let node: SyntaxNode | null = tree.resolveInner(marker.markerFrom, 1);
			let isList = false;
			for (; node; node = node.parent) {
				const tokenClasses = obsidianTokenClassNodeProp
					? node.type.prop(obsidianTokenClassNodeProp) ?? ""
					: "";
				if (isEditableListSyntaxMetadata(`${node.name} ${tokenClasses}`)) {
					isList = true;
					break;
				}
			}
			if (!isList) continue;

			const plan = planEditableListSeparator(
				line.text,
				line.from,
				marker.markerFrom,
				marker.markerTo
			);
			if (!plan) continue;
			ranges.push((plan.kind === "task" ? taskSeparator : markerSeparator)
				.range(plan.from, plan.to));
		}
	}

	return {
		decorations: Decoration.set(ranges, true),
		parseReady: true,
	};
};

/**
 * Give the existing source separator an adjustable advance width in Live
 * Preview. This is a mark decoration only: it does not replace text, declare
 * an atomic range, synthesize a marker, or override CodeMirror coordinates.
 */
export const editableListSeparatorExtension = (plugin: NotionBlock) => ViewPlugin.fromClass(
	class {
		decorations: DecorationSet;
		private parseReady: boolean;

		constructor(view: EditorView) {
			const presentation = buildDecorations(view, plugin);
			this.decorations = presentation.decorations;
			this.parseReady = presentation.parseReady;
		}

		update(update: ViewUpdate): void {
			const livePreviewChanged = update.startState.field(editorLivePreviewField, false)
				!== update.state.field(editorLivePreviewField, false);
			if (
				this.parseReady
				&& !livePreviewChanged
				&& !update.docChanged
				&& !update.viewportChanged
			) return;

			const presentation = buildDecorations(update.view, plugin);
			this.decorations = presentation.decorations;
			this.parseReady = presentation.parseReady;
		}
	},
	{ decorations: (value) => value.decorations }
);
