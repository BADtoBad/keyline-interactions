import { type EditorState, type Range, StateField } from "@codemirror/state";
import {
	Decoration,
	type DecorationSet,
	EditorView,
	WidgetType,
} from "@codemirror/view";
import {
	planEditorLayoutPresentation,
	type EditorLayoutGapPlan,
} from "./editorLayoutModel";

const gapClasses = (gap: EditorLayoutGapPlan): string => [
	"ncl-editor-block-gap",
	gap.direct ? `is-${gap.direct}` : "",
	gap.before ? `is-${gap.before}` : "",
	gap.after ? `is-${gap.after}` : "",
].filter(Boolean).join(" ");

class EditorBlockGapWidget extends WidgetType {
	constructor(private readonly classes: string) {
		super();
	}

	eq(other: EditorBlockGapWidget): boolean {
		return this.classes === other.classes;
	}

	toDOM(view: EditorView): HTMLElement {
		const element = view.dom.ownerDocument.createElement("div");
		element.className = this.classes;
		element.setAttribute("aria-hidden", "true");
		element.setAttribute("role", "presentation");
		return element;
	}
}

const buildDecorations = (state: EditorState): DecorationSet => {
	const text = state.doc.toString();
	const ranges: Range<Decoration>[] = [];
	const plan = planEditorLayoutPresentation(text);

	for (const line of plan.lines) {
		const classes = [
			line.kind === "paragraph" ? "ncl-editor-paragraph-line" : "ncl-editor-heading-line",
			line.isFirst ? "is-first" : "",
			line.isLast ? "is-last" : "",
		].filter(Boolean).join(" ");
		ranges.push(Decoration.line({ class: classes }).range(line.lineFrom));
	}

	for (const gap of plan.gaps) {
		ranges.push(Decoration.widget({
			widget: new EditorBlockGapWidget(gapClasses(gap)),
			block: true,
			side: gap.side,
		}).range(gap.at));
	}

	return Decoration.set(ranges, true);
};

/**
 * Stable paragraph, heading and Quote rhythm for Source mode and Live Preview.
 *
 * This must be a StateField rather than a ViewPlugin: CodeMirror only permits
 * directly supplied decorations to affect vertical layout. The gap widgets
 * sit between lines, so `.cm-line` retains native text/caret coordinates.
 */
const editorLayoutField = StateField.define<DecorationSet>({
	create: (state) => buildDecorations(state),
	update: (decorations, transaction) =>
		transaction.docChanged ? buildDecorations(transaction.state) : decorations,
	provide: (field) => EditorView.decorations.from(field),
});

export const editorLayoutExtension = () => editorLayoutField;
