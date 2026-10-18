import {
	EditorSelection,
	EditorState,
	Prec,
	RangeSetBuilder,
	Transaction,
} from "@codemirror/state";
import { Decoration, drawSelection, EditorView, WidgetType } from "@codemirror/view";
import { editorLayoutExtension } from "../../src/editorLayout";

// Start at a different value so the fixture has to exercise the production
// same-selection redraw path before it can pass at the test-Vault's 10px.
document.body.style.setProperty("--ncl-list-marker-gap", "4px");

const listLine = Decoration.line({ class: "HyperMD-list-line" });
const markerOuter = Decoration.mark({
	class: "cm-formatting cm-formatting-list cm-formatting-list-ul",
});
const markerBullet = Decoration.mark({ class: "list-bullet" });
const separator = Decoration.mark({
	class: "ncl-editor-list-separator is-marker",
});

const createListView = (selector: string, doc: string): EditorView => {
	const parent = document.querySelector<HTMLElement>(selector);
	if (!parent) throw new Error(`missing fixture host: ${selector}`);
	const outer = Decoration.set([
		listLine.range(0),
		markerOuter.range(0, 1),
		separator.range(1, 2),
	], true);
	const inner = Decoration.set([markerBullet.range(0, 1)]);
	return new EditorView({
		state: EditorState.create({
			doc,
			selection: EditorSelection.cursor(2, 1),
			extensions: [
				EditorView.decorations.of(outer),
				Prec.highest(EditorView.decorations.of(inner)),
				drawSelection(),
			],
		}),
		parent,
	});
};

const emptyView = createListView("#empty-list", "- ");
const filledView = createListView("#filled-list", "- A");

class NativeTaskWidget extends WidgetType {
	toDOM(view: EditorView): HTMLElement {
		const label = view.dom.ownerDocument.createElement("label");
		label.className = "task-list-label";
		const checkbox = view.dom.ownerDocument.createElement("input");
		checkbox.className = "task-list-item-checkbox";
		checkbox.type = "checkbox";
		label.append(checkbox);
		return label;
	}
}

const createTaskView = (): EditorView => {
	const parent = document.querySelector<HTMLElement>("#task-list");
	if (!parent) throw new Error("missing task fixture host");
	const outer = Decoration.set([
		listLine.range(0),
		markerOuter.range(0, 1),
		Decoration.mark({ class: "ncl-editor-list-separator is-task" }).range(5, 6),
	], true);
	const inner = Decoration.set([markerBullet.range(0, 1)]);
	const nativeTaskBuilder = new RangeSetBuilder<Decoration>();
	nativeTaskBuilder.add(2, 5, Decoration.widget({ widget: new NativeTaskWidget() }));
	return new EditorView({
		state: EditorState.create({
			doc: "- [ ] A",
			selection: EditorSelection.cursor(6, 1),
			extensions: [
				EditorView.decorations.of(nativeTaskBuilder.finish()),
				EditorView.decorations.of(outer),
				Prec.highest(EditorView.decorations.of(inner)),
				drawSelection(),
			],
		}),
		parent,
	});
};

const taskView = createTaskView();

const createListQuoteView = (): EditorView => {
	const parent = document.querySelector<HTMLElement>("#list-quote-transition");
	if (!parent) throw new Error("missing list-to-quote fixture host");
	const quoteLineFrom = 4;
	const decorations = Decoration.set([
		listLine.range(0),
		markerOuter.range(0, 1),
		separator.range(1, 2),
		Decoration.line({
			class: "HyperMD-quote ncl-styled-quote-line is-first is-last",
		}).range(quoteLineFrom),
		Decoration.replace({}).range(quoteLineFrom, quoteLineFrom + 2),
	], true);
	const inner = Decoration.set([markerBullet.range(0, 1)]);
	return new EditorView({
		state: EditorState.create({
			doc: "- A\n> B",
			selection: EditorSelection.cursor(6, 1),
			extensions: [
				editorLayoutExtension(),
				EditorView.decorations.of(decorations),
				Prec.highest(EditorView.decorations.of(inner)),
				drawSelection(),
			],
		}),
		parent,
	});
};

const createPlainEnterView = (): EditorView => {
	const parent = document.querySelector<HTMLElement>("#plain-enter-transition");
	if (!parent) throw new Error("missing plain Enter fixture host");
	return new EditorView({
		state: EditorState.create({
			doc: "A\n",
			selection: EditorSelection.cursor(2, 1),
			extensions: [editorLayoutExtension(), drawSelection()],
		}),
		parent,
	});
};

const createQuoteExitView = (): EditorView => {
	const parent = document.querySelector<HTMLElement>("#quote-exit-transition");
	if (!parent) throw new Error("missing Quote exit fixture host");
	const quote = Decoration.set([
		Decoration.line({
			class: "HyperMD-quote ncl-styled-quote-line is-first is-last",
		}).range(0),
		Decoration.replace({}).range(0, 2),
	], true);
	return new EditorView({
		state: EditorState.create({
			doc: "> Q\n",
			selection: EditorSelection.cursor(4, 1),
			extensions: [
				editorLayoutExtension(),
				EditorView.decorations.of(quote),
				drawSelection(),
			],
		}),
		parent,
	});
};

const createMultilineQuoteView = (): EditorView => {
	const parent = document.querySelector<HTMLElement>("#multiline-quote");
	if (!parent) throw new Error("missing multiline Quote fixture host");
	const quote = Decoration.set([
		Decoration.line({
			class: "HyperMD-quote ncl-styled-quote-line is-first",
		}).range(0),
		Decoration.replace({}).range(0, 2),
		Decoration.line({
			class: "HyperMD-quote ncl-styled-quote-line is-last",
		}).range(4),
		Decoration.replace({}).range(4, 6),
	], true);
	return new EditorView({
		state: EditorState.create({
			doc: "> A\n> B",
			extensions: [editorLayoutExtension(), EditorView.decorations.of(quote)],
		}),
		parent,
	});
};

const listQuoteView = createListQuoteView();
const plainEnterView = createPlainEnterView();
const quoteExitView = createQuoteExitView();
const multilineQuoteView = createMultilineQuoteView();
emptyView.focus();

type Metrics = {
	left: number;
	right: number;
	top: number;
	bottom: number;
	width: number;
	height: number;
};

const metrics = (rect: Pick<DOMRect, "left" | "right" | "top" | "bottom" | "width" | "height">): Metrics => ({
	left: rect.left,
	right: rect.right,
	top: rect.top,
	bottom: rect.bottom,
	width: rect.width,
	height: rect.height,
});

const coords = (view: EditorView, pos: number, side: -1 | 1): Metrics => {
	const rect = view.coordsAtPos(pos, side);
	if (!rect) throw new Error(`missing coordinates at ${pos}/${side}`);
	return {
		left: rect.left,
		right: rect.right,
		top: rect.top,
		bottom: rect.bottom,
		width: rect.right - rect.left,
		height: rect.bottom - rect.top,
	};
};

const textRect = (root: HTMLElement, needle: string): Metrics => {
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		const index = node.nodeValue?.indexOf(needle) ?? -1;
		if (index < 0) continue;
		const range = document.createRange();
		range.setStart(node, index);
		range.setEnd(node, index + 1);
		return metrics(range.getBoundingClientRect());
	}
	throw new Error(`missing text node: ${JSON.stringify(needle)}`);
};

const focusedCursorRect = (view: EditorView): Metrics => {
	view.focus();
	view.dispatch({
		selection: view.state.selection,
		annotations: Transaction.addToHistory.of(false),
	});
	const cursor = view.dom.querySelector<HTMLElement>(".cm-cursor-primary");
	if (!cursor) throw new Error("focused cursor is missing");
	return metrics(cursor.getBoundingClientRect());
};

const measureFixture = (): void => {
	try {
		const separatorSpan = emptyView.dom.querySelector<HTMLElement>(".ncl-editor-list-separator");
		const line = emptyView.dom.querySelector<HTMLElement>(".cm-line");
		const taskCheckbox = taskView.dom.querySelector<HTMLElement>(".task-list-item-checkbox");
		const quoteLine = listQuoteView.dom.querySelector<HTMLElement>(".ncl-styled-quote-line");
		const listQuoteGap = listQuoteView.dom.querySelector<HTMLElement>(
			".ncl-editor-block-gap.is-paragraph-before"
		);
		const quoteBoundaryGap = quoteExitView.dom.querySelector<HTMLElement>(
			".ncl-editor-block-gap.is-paragraph-before.is-paragraph-after"
		);
		const quoteInternalGap = multilineQuoteView.dom.querySelector<HTMLElement>(
			".ncl-editor-block-gap.is-quote-line"
		);
		const quoteLines = multilineQuoteView.dom.querySelectorAll<HTMLElement>(".ncl-styled-quote-line");
		if (
			!separatorSpan
			|| !line
			|| !taskCheckbox
			|| !quoteLine
			|| !listQuoteGap
			|| !quoteBoundaryGap
			|| !quoteInternalGap
			|| quoteLines.length !== 2
		) {
			throw new Error("fixture DOM is incomplete");
		}

		const advances = [4, 10, 18].map((gap) => {
			document.body.style.setProperty("--ncl-list-marker-gap", `${gap}px`);
			return { gap, measured: textRect(separatorSpan, " ").width };
		});
		const taskGaps = [4, 10, 18].map((gap) => {
			document.body.style.setProperty("--ncl-list-marker-gap", `${gap}px`);
			return {
				gap,
				measured: textRect(taskView.contentDOM, "A").left
					- taskCheckbox.getBoundingClientRect().right,
			};
		});
		document.body.style.setProperty("--ncl-list-marker-gap", "10px");
		for (const view of [emptyView, filledView, taskView, listQuoteView]) {
			view.dispatch({
				selection: view.state.selection,
				annotations: Transaction.addToHistory.of(false),
			});
			view.requestMeasure();
		}

		emptyView.focus();
		const emptyBoundary = coords(emptyView, 2, 1);
		const filledBoundary = coords(filledView, 2, 1);
		const filledGlyph = textRect(filledView.contentDOM, "A");
		const taskBoundary = coords(taskView, 6, 1);
		const taskGlyph = textRect(taskView.contentDOM, "A");
		const separatorText = textRect(separatorSpan, " ");
		const listCursor = emptyView.dom.querySelector<HTMLElement>(".cm-cursor-primary");
		if (!listCursor) throw new Error("refreshed list cursor is missing");
		const cursorRect = metrics(listCursor.getBoundingClientRect());
		const cursorStyle = getComputedStyle(listCursor);
		const lineStyle = getComputedStyle(line);

		const quoteStyle = getComputedStyle(quoteLine);
		const quoteRailStyle = getComputedStyle(quoteLine, "::after");
		const quoteGlyphTopWithGap = textRect(listQuoteView.contentDOM, "B").top;
		const listQuoteGapHeight = listQuoteGap.getBoundingClientRect().height;
		document.body.style.setProperty("--ncl-paragraph-before", "0px");
		listQuoteView.requestMeasure();
		const quoteGlyphTopWithoutGap = textRect(listQuoteView.contentDOM, "B").top;
		document.body.style.setProperty("--ncl-paragraph-before", "16px");
		listQuoteView.requestMeasure();

		const plainBlankCursor = focusedCursorRect(plainEnterView);
		const plainBlankStart = coords(plainEnterView, 2, 1);
		plainEnterView.dispatch({
			changes: { from: 2, insert: "B" },
			selection: EditorSelection.cursor(3, 1),
		});
		const plainTypedCursor = focusedCursorRect(plainEnterView);
		const plainTypedGlyph = textRect(plainEnterView.contentDOM, "B");
		const plainTypedStart = coords(plainEnterView, 2, 1);

		const quoteBlankCursor = focusedCursorRect(quoteExitView);
		const quoteBlankStart = coords(quoteExitView, 4, 1);
		const quoteBoundaryHeightBeforeTyping = quoteBoundaryGap.getBoundingClientRect().height;
		quoteExitView.dispatch({
			changes: { from: 4, insert: "B" },
			selection: EditorSelection.cursor(5, 1),
		});
		const quoteTypedCursor = focusedCursorRect(quoteExitView);
		const quoteTypedGlyph = textRect(quoteExitView.contentDOM, "B");
		const quoteTypedStart = coords(quoteExitView, 4, 1);
		const typedQuoteBoundary = quoteExitView.dom.querySelector<HTMLElement>(
			".ncl-editor-block-gap.is-paragraph-before.is-paragraph-after"
		);
		if (!typedQuoteBoundary) throw new Error("typed Quote boundary gap is missing");

		const firstQuoteRail = getComputedStyle(quoteLines[0], "::after");
		const firstQuoteLineRect = quoteLines[0].getBoundingClientRect();
		const secondQuoteLineRect = quoteLines[1].getBoundingClientRect();
		const values = {
			separatorText,
			advances,
			taskGaps,
			emptyBoundary,
			filledBoundary,
			filledGlyph,
			taskBoundary,
			taskGlyph,
			cursorRect,
			separatorAdvance: separatorText.width,
			emptyBoundaryToSeparatorEnd: Math.abs(emptyBoundary.left - separatorText.right),
			filledBoundaryToGlyph: Math.abs(filledBoundary.left - filledGlyph.left),
			emptyHeightToGlyph: Math.abs(emptyBoundary.height - filledGlyph.height),
			filledHeightToGlyph: Math.abs(filledBoundary.height - filledGlyph.height),
			cursorHeightToGlyph: Math.abs(cursorRect.height - filledGlyph.height),
			cursorToSeparatorEnd: Math.abs(cursorRect.left - separatorText.right),
			taskBoundaryToGlyph: Math.abs(taskBoundary.left - taskGlyph.left),
			taskHeightToGlyph: Math.abs(taskBoundary.height - taskGlyph.height),
			cursorCount: emptyView.dom.querySelectorAll(".cm-cursor").length,
			cursorBorderWidth: cursorStyle.borderLeftWidth,
			cursorMarginLeft: cursorStyle.marginLeft,
			nativeCaretColor: lineStyle.caretColor,
			quotePaddingBefore: quoteStyle.paddingBlockStart,
			quotePaddingAfter: quoteStyle.paddingBlockEnd,
			quoteRailTop: quoteRailStyle.top,
			quoteRailBottom: quoteRailStyle.bottom,
			quoteRailWidth: quoteRailStyle.width,
			listQuoteGapHeight,
			quoteGapAdvance: quoteGlyphTopWithGap - quoteGlyphTopWithoutGap,
			plainBlankCursor,
			plainTypedCursor,
			plainTypedGlyph,
			plainBlankToTypedTop: Math.abs(plainBlankStart.top - plainTypedStart.top),
			plainBlankToTypedCursorTop: Math.abs(plainBlankCursor.top - plainTypedCursor.top),
			plainBlankCursorHeightToGlyph: Math.abs(plainBlankCursor.height - plainTypedGlyph.height),
			plainTypedCursorHeightToGlyph: Math.abs(plainTypedCursor.height - plainTypedGlyph.height),
			quoteBlankCursor,
			quoteTypedCursor,
			quoteTypedGlyph,
			quoteBlankToTypedTop: Math.abs(quoteBlankStart.top - quoteTypedStart.top),
			quoteBlankToTypedCursorTop: Math.abs(quoteBlankCursor.top - quoteTypedCursor.top),
			quoteBlankCursorHeightToGlyph: Math.abs(quoteBlankCursor.height - quoteTypedGlyph.height),
			quoteTypedCursorHeightToGlyph: Math.abs(quoteTypedCursor.height - quoteTypedGlyph.height),
			quoteBoundaryHeightBeforeTyping,
			quoteBoundaryHeightAfterTyping: typedQuoteBoundary.getBoundingClientRect().height,
			quoteInternalGapHeight: quoteInternalGap.getBoundingClientRect().height,
			quoteInternalVisualGap: secondQuoteLineRect.top - firstQuoteLineRect.bottom,
			firstQuoteRailBottom: firstQuoteRail.bottom,
		};
		const nativeCaretHidden = values.nativeCaretColor === "transparent"
			|| values.nativeCaretColor === "rgba(0, 0, 0, 0)";
		const finite = Object.values({
			separatorAdvance: values.separatorAdvance,
			emptyBoundaryToSeparatorEnd: values.emptyBoundaryToSeparatorEnd,
			filledBoundaryToGlyph: values.filledBoundaryToGlyph,
			emptyHeightToGlyph: values.emptyHeightToGlyph,
			filledHeightToGlyph: values.filledHeightToGlyph,
			cursorHeightToGlyph: values.cursorHeightToGlyph,
			cursorToSeparatorEnd: values.cursorToSeparatorEnd,
			taskBoundaryToGlyph: values.taskBoundaryToGlyph,
			taskHeightToGlyph: values.taskHeightToGlyph,
			plainBlankToTypedTop: values.plainBlankToTypedTop,
			plainBlankToTypedCursorTop: values.plainBlankToTypedCursorTop,
			plainBlankCursorHeightToGlyph: values.plainBlankCursorHeightToGlyph,
			plainTypedCursorHeightToGlyph: values.plainTypedCursorHeightToGlyph,
			quoteBlankToTypedTop: values.quoteBlankToTypedTop,
			quoteBlankToTypedCursorTop: values.quoteBlankToTypedCursorTop,
			quoteBlankCursorHeightToGlyph: values.quoteBlankCursorHeightToGlyph,
			quoteTypedCursorHeightToGlyph: values.quoteTypedCursorHeightToGlyph,
		}).every(Number.isFinite);
		const pass = finite
			&& advances.every(({ gap, measured }) => Math.abs(measured - gap) <= 0.75)
			&& taskGaps.every(({ gap, measured }) => Math.abs(measured - gap) <= 0.75)
			&& Math.abs(values.separatorAdvance - 10) <= 0.75
			&& values.emptyBoundaryToSeparatorEnd <= 0.75
			&& values.filledBoundaryToGlyph <= 0.75
			&& values.emptyHeightToGlyph <= 0.75
			&& values.filledHeightToGlyph <= 0.75
			&& values.cursorHeightToGlyph <= 0.75
			&& values.cursorToSeparatorEnd <= 0.75
			&& values.taskBoundaryToGlyph <= 0.75
			&& values.taskHeightToGlyph <= 0.75
			&& values.cursorCount === 1
			&& values.cursorBorderWidth === "1px"
			&& values.cursorMarginLeft === "0px"
			&& nativeCaretHidden
			&& values.quotePaddingBefore === "0px"
			&& values.quotePaddingAfter === "0px"
			&& values.quoteRailTop === "0px"
			&& values.quoteRailBottom === "0px"
			&& values.quoteRailWidth === "2px"
			&& Math.abs(values.listQuoteGapHeight - 16) <= 0.75
			&& Math.abs(values.quoteGapAdvance - 16) <= 0.75
			&& values.plainBlankToTypedTop <= 0.75
			&& values.plainBlankToTypedCursorTop <= 0.75
			&& values.plainBlankCursorHeightToGlyph <= 0.75
			&& values.plainTypedCursorHeightToGlyph <= 0.75
			&& values.quoteBlankToTypedTop <= 0.75
			&& values.quoteBlankToTypedCursorTop <= 0.75
			&& values.quoteBlankCursorHeightToGlyph <= 0.75
			&& values.quoteTypedCursorHeightToGlyph <= 0.75
			&& Math.abs(values.quoteBoundaryHeightBeforeTyping - 16) <= 0.75
			&& Math.abs(values.quoteBoundaryHeightAfterTyping - 16) <= 0.75
			&& Math.abs(values.quoteInternalGapHeight - 10) <= 0.75
			&& Math.abs(values.quoteInternalVisualGap - 10) <= 0.75
			&& values.firstQuoteRailBottom === "-10px";

		document.body.dataset.result = pass ? "pass" : "fail";
		const output = document.querySelector<HTMLElement>("#result");
		if (output) output.textContent = JSON.stringify(values);
	} catch (error) {
		document.body.dataset.result = "error";
		const output = document.querySelector<HTMLElement>("#result");
		if (output) output.textContent = error instanceof Error ? error.stack ?? error.message : String(error);
	}
};

// Reading layout metrics forces a synchronous layout flush, so a timer is
// more deterministic than animation frames in macOS headless Chrome.
window.setTimeout(measureFixture, 50);
