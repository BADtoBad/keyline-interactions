import { localize } from './locale/ui';
import {
	StateField,
	StateEffect,
	Transaction,
	type EditorState,
	type Extension,
} from "@codemirror/state";
import {
	EditorView,
	showTooltip,
	ViewPlugin,
	type Tooltip,
	type TooltipView,
	type ViewUpdate,
} from "@codemirror/view";
import { Notice, setIcon } from "obsidian";
import type NotionBlock from "./main";
import { showNotionBlockActionMenu } from "./notionActionMenu";
import { marginaliaProvider, type MarginKind } from "./marginaliaBridge";

const dismissSelectionToolbar = StateEffect.define<null>();

interface ToolbarAction {
	label: string;
	icon: string;
	commandId: string;
}

const TOOLBAR_ACTIONS: ToolbarAction[] = [
	{ label: localize("粗体"), icon: "bold", commandId: "editor:toggle-bold" },
	{ label: localize("斜体"), icon: "italic", commandId: "editor:toggle-italics" },
	{ label: localize("删除线"), icon: "strikethrough", commandId: "editor:toggle-strikethrough" },
	{ label: localize("行内代码"), icon: "code", commandId: "editor:toggle-code" },
	{ label: localize("链接"), icon: "link", commandId: "editor:insert-link" },
	{ label: localize("高亮"), icon: "highlighter", commandId: "editor:toggle-highlight" },
];

const documentReplacementCount = new WeakMap<Document, number>();

const TOOLBAR_THEME_TOKENS = [
	["--nmg-toolbar-bg", ["--ncl-surface-bg", "--background-primary"], "Canvas"],
	["--nmg-toolbar-border", ["--ncl-surface-border", "--background-modifier-border"], "ButtonBorder"],
	["--nmg-toolbar-shadow", ["--ncl-toolbar-shadow", "--shadow-s"], "none"],
	["--nmg-toolbar-text", ["--text-normal"], "CanvasText"],
	["--nmg-toolbar-muted", ["--text-muted"], "CanvasText"],
	["--nmg-toolbar-faint", ["--text-faint", "--text-muted"], "GrayText"],
	["--nmg-toolbar-hover", ["--background-modifier-hover"], "transparent"],
	["--nmg-toolbar-active", ["--background-modifier-active-hover"], "transparent"],
	["--nmg-toolbar-accent", ["--interactive-accent"], "Highlight"],
] as const;

/**
 * CodeMirror may portal tooltips outside the editor's themed subtree. Copy
 * resolved semantic tokens onto the toolbar so the portal cannot fall back to
 * CodeMirror's light surface while its icons still inherit dark-mode text.
 */
function snapshotToolbarTheme(source: HTMLElement, toolbar: HTMLElement): void {
	const ownerWindow = source.ownerDocument.defaultView;
	if (!ownerWindow) return;
	const computed = ownerWindow.getComputedStyle(source);
	for (const [targetName, sourceNames, fallback] of TOOLBAR_THEME_TOKENS) {
		let value = "";
		for (const sourceName of sourceNames) {
			const candidate = computed.getPropertyValue(sourceName).trim();
			// A copied custom property cannot resolve variables that only existed
			// in the former subtree, so prefer the first concrete token value.
			if (candidate && !candidate.includes("var(")) {
				value = candidate;
				break;
			}
		}
		toolbar.style.setProperty(targetName, value || fallback);
	}
}

function addReplacementClass(doc: Document): void {
	const next = (documentReplacementCount.get(doc) ?? 0) + 1;
	documentReplacementCount.set(doc, next);
	doc.body.classList.add("nmg-selection-toolbar-enabled");
}

function removeReplacementClass(doc: Document): void {
	const next = Math.max(0, (documentReplacementCount.get(doc) ?? 1) - 1);
	if (next === 0) {
		documentReplacementCount.delete(doc);
		doc.body.classList.remove("nmg-selection-toolbar-enabled");
	} else {
		documentReplacementCount.set(doc, next);
	}
}

function styleLabel(lineText: string): string {
	if (/^#####\s/u.test(lineText)) return localize("标题 5");
	if (/^####\s/u.test(lineText)) return localize("标题 4");
	if (/^###\s/u.test(lineText)) return localize("标题 3");
	if (/^##\s/u.test(lineText)) return localize("标题 2");
	if (/^#\s/u.test(lineText)) return localize("标题 1");
	if (/^[-*+]\s+\[[ xX]\]\s+/u.test(lineText)) return localize("待办");
	if (/^[-*+]\s+/u.test(lineText)) return localize("项目符号列表");
	if (/^\d+\.\s+/u.test(lineText)) return localize("编号列表");
	if (/^>\s+\[!/u.test(lineText)) return "Callout";
	if (/^>\s+/u.test(lineText)) return localize("引用");
	if (/^```/u.test(lineText)) return localize("代码块");
	if (/^\$\$/u.test(lineText)) return localize("公式块");
	return localize("正文");
}

function toolbarIsEnabled(plugin: NotionBlock): boolean {
	return plugin.settings.enabled && plugin.settings.selectionToolbar;
}

interface ToolbarRange {
	from: number;
	to: number;
}

export function selectedToolbarRange(
	state: EditorState,
	enabled: boolean
): ToolbarRange | null {
	if (!enabled || state.selection.ranges.length !== 1) return null;
	const selection = state.selection.main;
	return selection.empty ? null : { from: selection.from, to: selection.to };
}

function makeTooltip(plugin: NotionBlock, state: EditorState): Tooltip | null {
	const range = selectedToolbarRange(state, toolbarIsEnabled(plugin));
	if (!range) return null;
	return {
		pos: range.from,
		end: range.to,
		above: true,
		strictSide: false,
		arrow: false,
		create: (view) => new SelectionToolbarTooltip(plugin, view),
	};
}

class SelectionToolbarTooltip implements TooltipView {
	readonly dom: HTMLElement;
	readonly offset = { x: 0, y: 6 };
	private readonly plugin: NotionBlock;
	private readonly view: EditorView;
	private readonly styleButton: HTMLButtonElement;
	private readonly noteButtons: HTMLButtonElement[] = [];
	private readonly onMarginaliaChanged = () => this.refreshLabel();

	constructor(plugin: NotionBlock, view: EditorView) {
		this.plugin = plugin;
		this.view = view;
		const ownerDocument = view.dom.ownerDocument;
		this.dom = ownerDocument.createElement("div");
		this.dom.className = "nmg-selection-toolbar";
		const themeSource = view.dom.closest<HTMLElement>(".theme-dark, .theme-light")
			?? ownerDocument.body;
		snapshotToolbarTheme(themeSource, this.dom);
		this.dom.setAttribute("role", "toolbar");
		this.dom.setAttribute("aria-label", localize("文本格式"));
		this.dom.addEventListener("pointerdown", (event) => {
			// Clicking a toolbar control must not collapse the CodeMirror
			// selection that the control is about to format.
			if (event.button === 0) event.preventDefault();
			event.stopPropagation();
		});
		this.dom.addEventListener("keydown", (event) => {
			const buttons = Array.from(this.dom.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
			const at = buttons.indexOf(ownerDocument.activeElement as HTMLButtonElement);
			if (event.key === 'Escape') {
				event.preventDefault(); event.stopPropagation();
				view.focus(); view.dispatch({ effects: dismissSelectionToolbar.of(null) });
				return;
			}
			if (at < 0 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
			event.preventDefault(); event.stopPropagation();
			const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
				: (at + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
			buttons[next].focus(); buttons[next].scrollIntoView({ block: 'nearest', inline: 'nearest' });
		});

		this.styleButton = this.createTextButton(localize("正文"), localize("段落与块类型"), (button) => {
			this.openActionMenu(button);
		});
		this.styleButton.classList.add("nmg-selection-toolbar-style");
		this.appendSeparator();

		for (const action of TOOLBAR_ACTIONS) {
			this.createIconButton(action.icon, action.label, () => {
				this.executeCoreCommand(action.commandId, action.label);
			});
		}

		this.appendSeparator();
		for (const [kind, icon, label] of [
			['sidenote', 'text-quote', localize('插入旁注（编号）')],
			['marginnote', 'panel-right', localize('插入边注（无编号）')],
		] as const) {
			const button = this.createIconButton(icon, label, () => this.insertMargin(kind));
			button.dataset.marginKind = kind;
			this.noteButtons.push(button);
		}
		this.appendSeparator();
		this.createIconButton("palette", localize("文字与背景颜色"), (button) => {
			this.openActionMenu(button, "color");
		});
		this.createIconButton("ellipsis", localize("更多块操作"), (button) => {
			this.openActionMenu(button);
		});
		this.refreshLabel();
		ownerDocument.defaultView?.addEventListener('keyline-marginalia-settings', this.onMarginaliaChanged);
	}

	destroy(): void {
		this.dom.ownerDocument.defaultView?.removeEventListener('keyline-marginalia-settings', this.onMarginaliaChanged);
	}

	update(update: ViewUpdate): void {
		if (update.docChanged || update.selectionSet) this.refreshLabel();
	}

	private refreshLabel(): void {
		const selection = this.view.state.selection.main;
		const label = styleLabel(this.view.state.doc.lineAt(selection.from).text);
		this.styleButton.querySelector<HTMLElement>(".nmg-selection-toolbar-label")?.setText(label);
		const provider = marginaliaProvider(this.plugin);
		const reason = provider ? provider.availability(this.view) : localize('请启用独立插件 Keyline Marginalia。');
		for (const button of this.noteButtons) {
			button.disabled = !!reason;
			button.title = reason || button.getAttribute('aria-label') || '';
		}
	}

	private insertMargin(kind: MarginKind): void {
		// Use this tooltip's editor, not the workspace's possibly different
		// active leaf. A reversed selection still places its marker after text.
		marginaliaProvider(this.plugin)?.insertFromView(this.view, kind);
	}

	private createTextButton(
		text: string,
		label: string,
		action: (button: HTMLButtonElement) => void
	): HTMLButtonElement {
		const button = this.view.dom.ownerDocument.createElement("button");
		button.type = "button";
		button.className = "nmg-selection-toolbar-button nmg-selection-toolbar-text-button";
		button.title = label;
		button.setAttribute("aria-label", label);
		const textEl = this.view.dom.ownerDocument.createElement("span");
		textEl.className = "nmg-selection-toolbar-label";
		textEl.textContent = text;
		button.appendChild(textEl);
		const chevron = this.view.dom.ownerDocument.createElement("span");
		chevron.className = "nmg-selection-toolbar-chevron";
		setIcon(chevron, "chevron-down");
		button.appendChild(chevron);
		this.bindButton(button, () => action(button));
		this.dom.appendChild(button);
		return button;
	}

	private createIconButton(
		icon: string,
		label: string,
		action: (button: HTMLButtonElement) => void
	): HTMLButtonElement {
		const button = this.view.dom.ownerDocument.createElement("button");
		button.type = "button";
		button.className = "nmg-selection-toolbar-button nmg-selection-toolbar-icon-button";
		button.title = label;
		button.setAttribute("aria-label", label);
		setIcon(button, icon);
		this.bindButton(button, () => action(button));
		this.dom.appendChild(button);
		return button;
	}

	private bindButton(button: HTMLButtonElement, action: () => void): void {
		button.addEventListener("click", (event) => {
			event.preventDefault();
			event.stopPropagation();
			action();
		});
	}

	private appendSeparator(): void {
		const separator = this.view.dom.ownerDocument.createElement("span");
		separator.className = "nmg-selection-toolbar-separator";
		separator.setAttribute("aria-hidden", "true");
		this.dom.appendChild(separator);
	}

	private executeCoreCommand(commandId: string, label: string): void {
		this.view.focus();
		const commands = (this.plugin.app as unknown as {
			commands?: { executeCommandById(id: string): boolean };
		}).commands;
		if (!commands?.executeCommandById(commandId)) {
			new Notice(localize`Obsidian 未提供“${label}”命令。`);
		}
	}

	private openActionMenu(button: HTMLButtonElement, initialPage?: "color"): void {
		const selection = this.view.state.selection.main;
		if (selection.empty) return;
		const rect = button.getBoundingClientRect();
		showNotionBlockActionMenu(
			this.plugin,
			this.view,
			this.view.state.doc.lineAt(selection.from).number,
			{ x: rect.left, y: rect.bottom + 4 },
			{
				avoid: { top: rect.top, bottom: rect.bottom },
				selection: { from: selection.from, to: selection.to },
				initialPage,
			}
		);
	}
}

/**
 * A native CodeMirror tooltip owns placement, clipping, scrolling, and editor
 * teardown. This avoids a second body-positioned overlay competing with
 * Make.md's Inline Styler for the same selection lifecycle.
 */
export function selectionToolbarExtension(plugin: NotionBlock): Extension {
	const tooltipField = StateField.define<Tooltip | null>({
		create: (state) => makeTooltip(plugin, state),
		update: (current, transaction) => {
			if (transaction.effects.some(effect => effect.is(dismissSelectionToolbar))) return null;
			// Insertion deliberately selects the new placeholder for type-over.
			// That programmatic selection is not a request to format its text.
			const event = transaction.annotation(Transaction.userEvent) ?? "";
			if (/^(?:input\.margin\.(?:sidenote|marginnote)|keyline-marginalia\.insert-(?:sidenote|marginnote))$/.test(event)) return null;
			const range = selectedToolbarRange(transaction.state, toolbarIsEnabled(plugin));
			if (!range) return null;
			if (!current && !transaction.selection && !transaction.docChanged) return null;
			if (current?.pos === range.from && current.end === range.to) return current;
			return makeTooltip(plugin, transaction.state);
		},
		provide: (field) => showTooltip.from(field, (value) => value),
	});

	const replacementClass = ViewPlugin.fromClass(class {
		private readonly ownerDocument: Document;
		private replacementRegistered = false;

		constructor(view: EditorView) {
			this.ownerDocument = view.dom.ownerDocument;
			this.sync();
		}

		update(): void {
			this.sync();
		}

		destroy(): void {
			if (this.replacementRegistered) removeReplacementClass(this.ownerDocument);
		}

		private sync(): void {
			const enabled = toolbarIsEnabled(plugin);
			if (enabled === this.replacementRegistered) return;
			this.replacementRegistered = enabled;
			if (enabled) addReplacementClass(this.ownerDocument);
			else removeReplacementClass(this.ownerDocument);
		}
	});

	return [tooltipField, replacementClass];
}
