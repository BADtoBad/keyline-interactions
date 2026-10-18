import { localize } from './locale/ui';
import { EditorState } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { editorInfoField, moment, Notice, setIcon, TFile } from "obsidian";
import type NotionBlock from "./main";
import { dispatchBlockEdit } from "./history";
import { isProtectedMarkdownContext } from "./wikilinkInput";
import { placeMenu } from "./menuPosition";
import { FloatingSurfaceLease } from "./surfaceCoordinator";
import {
	findMentionPages, isMentionTextBoundary, mentionMatches, mentionWikilink,
	MENTION_DATES, MentionDate, MentionPage, MentionSession, readMentionSession,
} from "./mentionModel";

type Choice = { label: string; detail: string; icon: string } &
	({ date: MentionDate } | { path: string });
let menuId = 0;

function sourcePath(state: EditorState): string {
	// Embedded Journal editors and split panes must use their own file, never
	// whichever document happens to be globally active when a row is clicked.
	return (editorInfoField && state.field(editorInfoField, false)?.file?.path) ?? "";
}

function protectedContext(view: EditorView, from: number): boolean {
	if (isProtectedMarkdownContext(view, from)) return true;
	const doc = view.state.doc, line = doc.lineAt(from);
	if (!isMentionTextBoundary(line.text.slice(0, from - line.from))) return true;
	let scanFrom = 0;
	// Frontmatter isn't present in every Markdown parser (e.g. embedded views).
	if (doc.line(1).text.replace(/^\uFEFF/u, "") === "---") {
		let closed = false;
		for (let n = 2; n <= line.number; n++) {
			if (/^(---|\.\.\.)\s*$/u.test(doc.line(n).text)) { closed = true; scanFrom = doc.line(n).to; break; }
		}
		if (!closed) return true;
	}
	// Ignore literal examples of %% / $$ in earlier code, links or HTML. A
	// global delimiter count would incorrectly suppress later ordinary prose.
	const pieces: string[] = [];
	syntaxTree(view.state).iterate({ from: scanFrom, to: from, enter(node) {
		if (!/(?:code|html|link|frontmatter)/iu.test(node.name)) return;
		if (node.from > scanFrom) pieces.push(doc.sliceString(scanFrom, Math.min(node.from, from)));
		scanFrom = Math.max(scanFrom, Math.min(node.to, from));
		return false;
	} });
	pieces.push(doc.sliceString(scanFrom, from));
	const before = pieces.join("").replace(/\\./gu, "");
	// Obsidian-specific blocks may be absent from an embedded editor's parser.
	if ((before.match(/%%/gu)?.length ?? 0) % 2 || (before.match(/\$\$/gu)?.length ?? 0) % 2) return true;
	return false;
}

function dateText(id: MentionDate, plugin: NotionBlock): string {
	const value = moment() as unknown as { add(n: number, unit: string): typeof value; format(pattern: string): string };
	if (id === "tomorrow") value.add(1, "days");
	if (id === "yesterday") value.add(-1, "days");
	return value.format(id === "time" ? plugin.settings.timeFormat : plugin.settings.dateFormat);
}

/** Passive suggestions. Only activate() is allowed to dispatch a text edit. */
export const mentionMenuExtension = (plugin: NotionBlock) => ViewPlugin.fromClass(class {
	private session: MentionSession | null = null;
	private root: HTMLElement | null = null;
	private list: HTMLElement | null = null;
	private lease: FloatingSurfaceLease | null = null;
	private pages: MentionPage[] = [];
	private choices: Choice[] = [];
	private active = -1;
	private renderedQuery = "";
	private pending: number | null = null;
	private composing = false;
	private readonly doc: Document;
	private readonly win: Window;
	private readonly id = `ncl-mention-${++menuId}`;
	private readonly originalAria = new Map<string, string | null>();
	private readonly onPointer = (event: PointerEvent): void => {
		if (!this.root?.contains(event.target as Node)) this.close();
	};
	private readonly onBlur = (): void => this.close();
	private readonly onCompositionStart = (): void => { this.composing = true; this.active = -1; this.syncActive(); };
	private readonly onCompositionEnd = (): void => { this.composing = false; };
	private readonly onKey = (event: KeyboardEvent): void => {
		if (!this.root || this.composing || this.view.composing || event.isComposing || event.keyCode === 229) return;
		if (!this.view.hasFocus) { this.close(); return; }
		if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); this.close(); return; }
		if (event.altKey || event.metaKey || event.ctrlKey) return;
		if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			if (!this.choices.length) return;
			event.preventDefault(); event.stopImmediatePropagation();
			this.active = this.active < 0 ? (event.key === "ArrowDown" ? 0 : this.choices.length - 1)
				: (this.active + (event.key === "ArrowDown" ? 1 : -1) + this.choices.length) % this.choices.length;
			this.syncActive();
		} else if (event.key === "Enter" && this.active >= 0) {
			event.preventDefault(); event.stopImmediatePropagation(); this.activate(this.active);
		} else if (["Enter", "Tab", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
			// No implicit first choice: normal newline/indent/movement preserves @.
			this.close();
		}
	};

	constructor(private view: EditorView) {
		this.doc = view.dom.ownerDocument;
		this.win = this.doc.defaultView!;
		view.contentDOM.addEventListener("compositionstart", this.onCompositionStart);
		view.contentDOM.addEventListener("compositionend", this.onCompositionEnd);
	}

	update(update: ViewUpdate): void {
		if (!plugin.settings.enabled || !plugin.settings.wikilinkInputAliases || update.state.readOnly || !update.state.facet(EditorView.editable) || !update.view.hasFocus) { this.close(); return; }
		if (this.session) {
			// Reject external edits, undo/redo, edits before @, selected ranges and
			// changing the editor's file while a scheduled menu is still pending.
			if (sourcePath(update.startState) !== sourcePath(update.state)
				|| update.state.selection.ranges.length !== 1 || !update.state.selection.main.empty) { this.close(); return; }
			for (const tr of update.transactions) {
				if (!tr.docChanged) continue;
				let safe = tr.isUserEvent("input.type") || tr.isUserEvent("delete.backward");
				tr.changes.iterChanges((a, b) => { if (a <= this.session!.from || b > this.session!.to) safe = false; });
				if (!safe) { this.close(); return; }
			}
			const next = readMentionSession(update.state.doc.toString(), this.session.from, update.state.selection.main.head);
			if (!next || (update.selectionSet && !update.docChanged && next.to !== this.session.to)) { this.close(); return; }
			if (next.query !== this.session.query) { this.session = next; this.active = -1; this.schedule(); }
			return;
		}
		if (!update.docChanged || update.state.selection.ranges.length !== 1 || !update.state.selection.main.empty) return;
		if (update.transactions.length !== 1) return;
		const tr = update.transactions[0];
		if (!tr.isUserEvent("input.type") || !tr.startState.selection.main.empty) return;
		let insertedAt = -1, count = 0;
		tr.changes.iterChanges((a, b, c, d, text) => { count++; if (a === b && text.toString() === "@" && d === update.state.selection.main.head) insertedAt = c; });
		if (count !== 1 || insertedAt < 0 || protectedContext(update.view, insertedAt)) return;
		this.session = { from: insertedAt, to: insertedAt + 1, query: "" };
		this.pages = plugin.app.vault.getMarkdownFiles().map(file => ({ path: file.path, basename: file.basename, modified: file.stat.mtime }));
		this.schedule();
	}

	private schedule(): void {
		if (this.pending !== null) return;
		// CodeMirror disallows layout reads during update. Coalesce typing/IME
		// bursts and measure only after the current editor transaction has ended.
		this.pending = this.win.setTimeout(() => {
			this.pending = null;
			if (!this.session || !this.view.hasFocus) { this.close(); return; }
			if (!this.root) this.open();
			this.render();
		}, 0);
	}

	private open(): void {
		this.lease = plugin.surfaceCoordinator.claim(this.doc, "insert-menu", () => this.close(), {
			dismissOnViewportChange: true,
			containsEventTarget: target => Boolean(target && this.root?.contains(target as Node)),
		});
		this.root = this.doc.createElement("div");
		this.root.className = "wk-nb-action-menu ncl-mention-menu";
		this.list = this.doc.createElement("div");
		this.list.className = "wk-nb-action-menu-list";
		this.list.id = this.id;
		this.list.setAttribute("role", "listbox");
		this.list.setAttribute("aria-label", localize("插入日期或链接到页面"));
		this.root.append(this.list);
		const hint = this.doc.createElement("div");
		hint.className = "ncl-mention-hint";
		hint.textContent = localize("↑↓ 选择 · Enter 插入 · Esc 保留原文");
		this.root.append(hint);
		this.root.addEventListener("mousedown", event => event.preventDefault());
		this.doc.body.append(this.root);
		for (const name of ["aria-controls", "aria-expanded", "aria-autocomplete", "aria-activedescendant"]) this.originalAria.set(name, this.view.contentDOM.getAttribute(name));
		this.view.contentDOM.setAttribute("aria-controls", this.id);
		this.view.contentDOM.setAttribute("aria-expanded", "true");
		this.view.contentDOM.setAttribute("aria-autocomplete", "list");
		this.doc.addEventListener("keydown", this.onKey, true);
		this.doc.addEventListener("pointerdown", this.onPointer, true);
		this.view.contentDOM.addEventListener("blur", this.onBlur);
		this.win.addEventListener("blur", this.onBlur);
	}

	private render(): void {
		if (!this.root || !this.list || !this.session) return;
		this.list.replaceChildren(); this.choices = [];
		const query = this.session.query;
		this.renderedQuery = query;
		const dates: Choice[] = MENTION_DATES.filter(item => mentionMatches(query, item.label, item.keywords, dateText(item.id, plugin)))
			.map(item => ({ date: item.id, label: item.label, detail: dateText(item.id, plugin), icon: item.id === "time" ? "clock" : "calendar" }));
		const pages: Choice[] = findMentionPages(this.pages, query).map(page => ({ path: page.path, label: page.basename, detail: page.path.includes("/") ? page.path.slice(0, page.path.lastIndexOf("/")) : localize("根目录"), icon: "file-text" }));
		this.group(localize("日期"), dates); this.group(localize("链接到页面"), pages);
		if (!this.choices.length) {
			const empty = this.doc.createElement("div"); empty.className = "ncl-mention-empty";
			empty.textContent = localize("没有匹配项，继续输入会保留原文"); empty.setAttribute("role", "status"); this.list.append(empty);
		}
		this.syncActive();
		const coords = this.view.coordsAtPos(this.session.to);
		if (!coords) { this.close(); return; }
		const height = this.list.scrollHeight + 38;
		const pos = placeMenu({ anchorX: coords.left, anchorY: coords.bottom + 6, avoidTop: coords.top,
			menuWidth: this.root.getBoundingClientRect().width, menuHeight: height,
			viewportWidth: this.win.innerWidth, viewportHeight: this.win.innerHeight, maxHeight: 400 });
		Object.assign(this.root.style, { left: `${Math.max(8, pos.left)}px`, top: `${pos.top}px`, maxHeight: `${Math.min(pos.maxHeight, this.win.innerHeight - 16)}px` });
	}

	private group(title: string, items: Choice[]): void {
		if (!this.list || !items.length) return;
		const group = this.doc.createElement("div"); group.setAttribute("role", "group"); group.setAttribute("aria-label", title);
		const heading = this.doc.createElement("div"); heading.className = "wk-nb-action-menu-section"; heading.textContent = title; heading.setAttribute("aria-hidden", "true"); group.append(heading);
		for (const item of items) {
			const index = this.choices.length; this.choices.push(item);
			const row = this.doc.createElement("div"); row.className = "wk-nb-action-menu-row ncl-mention-row";
			row.id = `${this.id}-${index}`; row.dataset.index = String(index); row.setAttribute("role", "option");
			const icon = this.doc.createElement("span"); icon.className = "wk-nb-action-menu-icon"; icon.setAttribute("aria-hidden", "true"); setIcon(icon, item.icon);
			const label = this.doc.createElement("span"); label.className = "ncl-mention-label"; label.textContent = item.label;
			const detail = this.doc.createElement("span"); detail.className = "ncl-mention-detail"; detail.textContent = item.detail;
			row.classList.toggle("is-date", "date" in item); row.append(icon, label, detail);
			row.addEventListener("pointermove", () => { if (!this.composing && this.active !== index) { this.active = index; this.syncActive(false); } });
			row.addEventListener("click", () => this.activate(index)); group.append(row);
		}
		this.list.append(group);
	}

	private syncActive(scroll = true): void {
		this.list?.querySelectorAll<HTMLElement>('[role="option"]').forEach((row, index) => {
			row.classList.toggle("is-active", index === this.active); row.setAttribute("aria-selected", String(index === this.active));
			if (scroll && index === this.active) row.scrollIntoView({ block: "nearest" });
		});
		if (this.active >= 0) this.view.contentDOM.setAttribute("aria-activedescendant", `${this.id}-${this.active}`);
		else this.view.contentDOM.removeAttribute("aria-activedescendant");
	}

	private activate(index: number): void {
		if (this.composing || this.view.composing || !plugin.settings.enabled || !plugin.settings.wikilinkInputAliases || this.view.state.readOnly || !this.view.state.facet(EditorView.editable)) return;
		const session = this.session, choice = this.choices[index], state = this.view.state;
		if (!session || !choice || !this.view.hasFocus || state.selection.ranges.length !== 1 || !state.selection.main.empty) { this.close(); return; }
		if (session.query !== this.renderedQuery) return;
		const current = readMentionSession(state.doc.toString(), session.from, state.selection.main.head);
		if (!current || current.query !== session.query || current.to !== session.to) { this.close(); return; }
		let insert: string | null;
		if ("date" in choice) insert = dateText(choice.date, plugin);
		else {
			const file = plugin.app.vault.getAbstractFileByPath(choice.path);
			if (!(file instanceof TFile) || file.extension !== "md") { this.close(); new Notice(localize("页面已移动或删除，请重新输入 @ 搜索。")); return; }
			const source = sourcePath(state);
			insert = mentionWikilink(source ? plugin.app.metadataCache.fileToLinktext(file, source, true) : file.path.replace(/\.md$/iu, ""));
			if (!insert) { this.close(); new Notice(localize("文件名含内部链接保留字符，请用 Obsidian 原生链接命令插入。原文已保留。")); return; }
		}
		this.close();
		dispatchBlockEdit(this.view, { changes: { from: session.from, to: session.to, insert }, selection: { anchor: session.from + insert.length }, userEvent: "input.mention", scrollIntoView: true });
	}

	private close(): void {
		if (this.pending !== null) this.win.clearTimeout(this.pending);
		this.pending = null; this.session = null; this.pages = []; this.choices = []; this.active = -1;
		this.lease?.release(); this.lease = null;
		this.root?.remove(); this.root = null; this.list = null;
		this.doc.removeEventListener("keydown", this.onKey, true);
		this.doc.removeEventListener("pointerdown", this.onPointer, true);
		this.view.contentDOM.removeEventListener("blur", this.onBlur);
		this.win.removeEventListener("blur", this.onBlur);
		for (const [name, value] of this.originalAria) {
			if (value === null) this.view.contentDOM.removeAttribute(name); else this.view.contentDOM.setAttribute(name, value);
		}
		this.originalAria.clear();
	}

	destroy(): void {
		this.close();
		this.view.contentDOM.removeEventListener("compositionstart", this.onCompositionStart);
		this.view.contentDOM.removeEventListener("compositionend", this.onCompositionEnd);
	}
});
