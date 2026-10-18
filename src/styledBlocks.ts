import type { Range } from "@codemirror/state";
import {
	Decoration,
	type DecorationSet,
	EditorView,
	ViewPlugin,
	type ViewUpdate,
	WidgetType,
} from "@codemirror/view";
import { editorLivePreviewField, setIcon } from "obsidian";
import { t } from "./locale/helpers";
import type NotionBlock from "./main";
import { planStyledBlocks, type StyledBlockLinePlan } from "./styledBlockModel";

const CALLOUT_ICONS: Record<string, string> = {
	note: "pencil",
	abstract: "clipboard-list",
	summary: "clipboard-list",
	tldr: "clipboard-list",
	info: "info",
	todo: "check-circle",
	tip: "flame",
	hint: "flame",
	important: "flame",
	success: "check",
	check: "check",
	done: "check",
	question: "help-circle",
	help: "help-circle",
	faq: "help-circle",
	warning: "alert-triangle",
	caution: "alert-triangle",
	attention: "alert-triangle",
	failure: "x-circle",
	fail: "x-circle",
	missing: "x-circle",
	danger: "zap",
	error: "zap",
	bug: "bug",
	example: "list",
	quote: "quote",
	cite: "quote",
};

const titleForType = (type: string): string => {
	const translated = t(`callout.${type}`);
	if (translated !== `callout.${type}`) return translated;
	return type.length > 0 ? `${type[0].toLocaleUpperCase()}${type.slice(1)}` : "Callout";
};

class CalloutHeaderWidget extends WidgetType {
	constructor(
		private readonly type: string,
		private readonly showDefaultTitle: boolean
	) {
		super();
	}

	eq(other: CalloutHeaderWidget): boolean {
		return this.type === other.type && this.showDefaultTitle === other.showDefaultTitle;
	}

	toDOM(view: EditorView): HTMLElement {
		const doc = view.dom.ownerDocument;
		const widget = doc.createElement("span");
		widget.className = "ncl-styled-callout-header";
		widget.dataset.callout = this.type;

		const icon = doc.createElement("span");
		icon.className = "ncl-styled-callout-header-icon";
		icon.setAttribute("aria-hidden", "true");
		setIcon(icon, CALLOUT_ICONS[this.type] ?? "pencil");
		widget.append(icon);

		if (this.showDefaultTitle) {
			const label = doc.createElement("span");
			label.className = "ncl-styled-callout-header-label";
			label.textContent = titleForType(this.type);
			widget.append(label);
		} else {
			// The explicit title remains ordinary editor text immediately after
			// this icon; hiding the decorative widget prevents a duplicate name.
			widget.setAttribute("aria-hidden", "true");
		}
		return widget;
	}
}

interface StyledBlockPresentation {
	decorations: DecorationSet;
	atomic: DecorationSet;
}

const EMPTY_PRESENTATION: StyledBlockPresentation = {
	decorations: Decoration.none,
	atomic: Decoration.none,
};

const lineIsVisible = (view: EditorView, line: StyledBlockLinePlan): boolean =>
	view.visibleRanges.some(({ from, to }) => line.lineFrom <= to && line.lineTo >= from);

const buildPresentation = (view: EditorView, plugin: NotionBlock): StyledBlockPresentation => {
	if (
		!plugin.settings.enabled
		|| !plugin.settings.hideSyntaxMarkers
		|| plugin.syntaxRevealActive
		|| !view.state.field(editorLivePreviewField, false)
	) {
		return EMPTY_PRESENTATION;
	}

	const decorations: Range<Decoration>[] = [];
	const atomic: Range<Decoration>[] = [];
	for (const line of planStyledBlocks(view.state.doc.toString())) {
		if (!lineIsVisible(view, line)) continue;

		const classes = [
			line.kind === "callout" ? "ncl-styled-callout-line" : "ncl-styled-quote-line",
			line.isFirst ? "is-first" : "",
			line.isLast ? "is-last" : "",
		].filter(Boolean).join(" ");
		const attributes: Record<string, string> = {};
		if (line.calloutType) attributes["data-ncl-callout"] = line.calloutType;
		decorations.push(Decoration.line({ class: classes, attributes }).range(line.lineFrom));

		const quoteMarker = Decoration.replace({});
		decorations.push(quoteMarker.range(line.markerFrom, line.markerTo));
		atomic.push(quoteMarker.range(line.markerFrom, line.markerTo));

		if (
			line.kind === "callout"
			&& line.isFirst
			&& line.calloutType
			&& line.headerFrom !== undefined
			&& line.headerTo !== undefined
			&& line.headerTo > line.headerFrom
		) {
			const calloutMarker = Decoration.replace({
				widget: new CalloutHeaderWidget(line.calloutType, !line.hasExplicitTitle),
			});
			decorations.push(calloutMarker.range(line.headerFrom, line.headerTo));
			atomic.push(calloutMarker.range(line.headerFrom, line.headerTo));
		}
	}

	return {
		decorations: Decoration.set(decorations, true),
		atomic: Decoration.set(atomic, true),
	};
};

/**
 * Keep Callout and quote Markdown as the sole stored source while presenting
 * their active Live Preview lines as the same block the reader sees.
 */
export function styledBlocksExtension(plugin: NotionBlock) {
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
				const livePreviewChanged = update.startState.field(editorLivePreviewField, false)
					!== update.state.field(editorLivePreviewField, false);
				if (
					!generationChanged
					&& !livePreviewChanged
					&& !update.docChanged
					&& !update.viewportChanged
				) return;

				const presentation = buildPresentation(update.view, plugin);
				this.decorations = presentation.decorations;
				this.atomic = presentation.atomic;
				this.generation = plugin.syntaxPresentationGeneration;
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
