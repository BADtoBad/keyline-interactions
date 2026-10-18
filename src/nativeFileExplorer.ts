import { localize } from './locale/ui';
import { App, Notice, TFolder, WorkspaceLeaf, setIcon } from "obsidian";
import {
	fileVisualKindForPath,
	nextAvailableMarkdownPath,
	type FileVisualKind,
} from "./nativeFileExplorerModel";
import { normalizeFileIconSettings, resolveFileIcon, ResolvedFileIcon } from './fileIconModel';
import { paintIdentity, clearIdentity, paintFileSelectionColor, clearFileSelectionColor, hasExternalIcon } from './fileIconManager';

interface ManagedRow {
	row: HTMLElement;
	root: HTMLElement;
	cleanup: () => void;
	refresh: () => void;
}

interface FolderIndicatorController {
	indicator: HTMLElement;
	cleanup: () => void;
	refresh: () => void;
}

interface FileIconController {
	cleanup: () => void;
	refresh: () => void;
}

const FILE_KIND_ROW_CLASSES: Record<FileVisualKind, string> = {
	markdown: "ncl-native-file-row-kind-markdown",
	pdf: "ncl-native-file-row-kind-pdf",
	epub: "ncl-native-file-row-kind-epub",
	image: "ncl-native-file-row-kind-image",
	audio: "ncl-native-file-row-kind-audio",
	video: "ncl-native-file-row-kind-video",
	canvas: "ncl-native-file-row-kind-canvas",
	code: "ncl-native-file-row-kind-code",
	archive: "ncl-native-file-row-kind-archive",
	generic: "ncl-native-file-row-kind-generic",
};

/**
 * Adds quiet, reversible affordances to Obsidian's own File Explorer rows.
 *
 * The filesystem, disclosure click target, drag/drop, selection and context
 * menu all remain core-owned. If Obsidian stops exposing the expected row or
 * indicator elements, the enhancer leaves that row alone instead of guessing.
 */
export class NativeFileExplorerEnhancer {
	private active = false;
	private readonly observers = new Map<HTMLElement, MutationObserver>();
	private readonly rows = new Map<HTMLElement, ManagedRow>();
	private readonly foldersCreating = new Set<string>();
	private refreshFrame: number | null = null;

	constructor(private readonly app: App, private readonly icons: {
		ownsIcons: () => boolean;
		resolve: (path: string, folder?: boolean, extension?: string, expanded?: boolean) => ResolvedFileIcon;
	} = { ownsIcons: () => true, resolve: (path, folder, extension, expanded) => resolveFileIcon(normalizeFileIconSettings(), path, folder, extension, expanded) }) {}

	start(): void {
		if (this.active) return;
		this.active = true;
		this.refresh();
	}

	stop(): void {
		this.active = false;
		if (this.refreshFrame !== null) {
			window.cancelAnimationFrame(this.refreshFrame);
			this.refreshFrame = null;
		}
		for (const observer of this.observers.values()) observer.disconnect();
		this.observers.clear();
		for (const managed of this.rows.values()) managed.cleanup();
		this.rows.clear();
	}

	refresh(): void {
		if (!this.active) return;
		// Make.md redirects getLeavesOfType("file-explorer") to its own view.
		// Enumerate workspace leaves and inspect their actual identity instead:
		// look-alike row classes are not permission to decorate another plugin.
		const roots = new Set<HTMLElement>();
		this.app.workspace.iterateAllLeaves((leaf) => {
			if (leaf.view.getViewType?.() !== "file-explorer") return;
			const root = leaf.view.containerEl;
			if (root?.isConnected) roots.add(root);
		});

		for (const [root, observer] of Array.from(this.observers.entries())) {
			if (roots.has(root)) continue;
			observer.disconnect();
			this.observers.delete(root);
		}

		for (const [row, managed] of Array.from(this.rows.entries())) {
			// A view can be replaced or change type while its old DOM is still
			// attached. Release both its paint and event handlers in that case.
			if (roots.has(managed.root) && managed.root.contains(row)) continue;
			managed.cleanup();
			this.rows.delete(row);
		}

		for (const root of roots) {
			this.observeRoot(root);
		}
	}

	private observeRoot(root: HTMLElement): void {
		if (this.observers.has(root)) {
			this.decorateRows(root);
			return;
		}

		const Observer = root.ownerDocument.defaultView?.MutationObserver;
		if (!Observer) return;

		const observer = new Observer(() => this.scheduleRefresh());
		observer.observe(root, {
			attributes: true,
			attributeFilter: ["class", "data-path"],
			childList: true,
			subtree: true,
		});
		this.observers.set(root, observer);
		this.decorateRows(root);
	}

	private scheduleRefresh(): void {
		if (!this.active || this.refreshFrame !== null) return;
		this.refreshFrame = window.requestAnimationFrame(() => {
			this.refreshFrame = null;
			if (this.active) this.refresh();
		});
	}

	private decorateRows(root: HTMLElement): void {
		const candidates = root.querySelectorAll<HTMLElement>(".nav-folder-title, .nav-file-title");
		for (const row of Array.from(candidates)) {
			const existing = this.rows.get(row);
			if (existing) {
				existing.refresh();
				continue;
			}
			const path = row.dataset.path;
			if (!path) continue;

			const isFolder = row.classList.contains("nav-folder-title");
			const actions = this.createActions(row, path, isFolder);
			row.append(actions);
			row.classList.add("ncl-native-row-enhanced");

			let folderIndicator: FolderIndicatorController | null = null;
			let fileIcon: FileIconController | null = null;
			const refresh = (): void => {
				if (isFolder) {
					if (!this.icons.ownsIcons() || hasExternalIcon(row)) {
						folderIndicator?.cleanup(); folderIndicator = null; return;
					}
					if (folderIndicator && row.contains(folderIndicator.indicator)) {
						folderIndicator.refresh();
						return;
					}
					folderIndicator?.cleanup();
					folderIndicator = this.decorateFolderIndicator(row);
					return;
				}

				if (fileIcon) {
					fileIcon.refresh();
					return;
				}
				fileIcon = this.decorateFileIcon(row);
			};
			refresh();

			const cleanup = (): void => {
				folderIndicator?.cleanup();
				fileIcon?.cleanup();
				actions.remove();
				row.classList.remove("ncl-native-row-enhanced");
			};
			this.rows.set(row, { row, root, cleanup, refresh });
		}
	}

	private createActions(row: HTMLElement, path: string, isFolder: boolean): HTMLElement {
		const doc = row.ownerDocument;
		const actions = doc.createElement("div");
		actions.className = "ncl-native-row-actions";
		actions.setAttribute("role", "group");
		actions.setAttribute("aria-label", localize`${path} 的快捷操作`);

		if (isFolder) {
			const addButton = this.createActionButton(doc, "plus", localize`在 ${path} 中新建笔记`);
			addButton.classList.add("ncl-native-row-add");
			addButton.addEventListener("click", (event) => {
				event.preventDefault();
				event.stopPropagation();
				void this.createNoteInFolder(row.dataset.path ?? path, row);
			});
			actions.append(addButton);
		}

		const moreButton = this.createActionButton(doc, "more-horizontal", localize`${path} 的更多操作`);
		moreButton.classList.add("ncl-native-row-more");
		moreButton.addEventListener("click", (event) => {
			event.preventDefault();
			event.stopPropagation();
			this.openNativeContextMenu(row, moreButton);
		});
		actions.append(moreButton);

		return actions;
	}

	private createActionButton(doc: Document, icon: string, label: string): HTMLButtonElement {
		const button = doc.createElement("button");
		button.type = "button";
		button.className = "clickable-icon ncl-native-row-action";
		button.setAttribute("aria-label", label);
		button.setAttribute("data-tooltip-position", "top");
		setIcon(button, icon);
		const stopRowInteraction = (event: Event): void => event.stopPropagation();
		button.addEventListener("pointerdown", stopRowInteraction);
		button.addEventListener("mousedown", stopRowInteraction);
		return button;
	}

	private createFileIconSlot(doc: Document, kind: FileVisualKind): HTMLElement {
		const iconSlot = doc.createElement("span");
		iconSlot.className = `tree-item-icon ncl-native-file-icon ncl-native-file-kind-${kind}`;
		iconSlot.dataset.fileKind = kind;
		iconSlot.setAttribute("aria-hidden", "true");
		return iconSlot;
	}

	private decorateFileIcon(row: HTMLElement): FileIconController | null {
		if (!row.querySelector(":scope > .nav-file-title-content")) return null;

		let iconSlot = row.querySelector<HTMLElement>(":scope > .ncl-native-file-icon");
		let activeKind: FileVisualKind | null = null;
		const clearRowKind = (): void => {
			for (const className of Object.values(FILE_KIND_ROW_CLASSES)) row.classList.remove(className);
			activeKind = null;
		};
		const kindForRow = (): FileVisualKind => {
			const path = row.dataset.path ?? row.closest<HTMLElement>("[data-path]")?.dataset.path ?? "";
			// Obsidian 1.13 can expose an attachment extension only through the
			// visible PNG/PDF badge while a virtualized row is being assembled.
			// Use that badge as a fallback so the identity never stays generic.
			const extension = row.querySelector<HTMLElement>(".nav-file-tag")?.textContent?.trim();
			return fileVisualKindForPath(path, extension ?? "");
		};
		const setRowKind = (kind: FileVisualKind): void => {
			if (activeKind === kind && row.classList.contains(FILE_KIND_ROW_CLASSES[kind])) return;
			clearRowKind();
			row.classList.add(FILE_KIND_ROW_CLASSES[kind]);
			activeKind = kind;
		};
		const removeIcon = (): void => {
			iconSlot?.remove();
			iconSlot = null;
			clearFileSelectionColor(row);
		};
		const refresh = (): void => {
			// Iconic owns the same semantic slot when present. Yield immediately,
			// and recreate our fallback if Iconic is later disabled.
			if (!this.icons.ownsIcons() || row.querySelector(":scope > .iconic-sidekick, :scope > .tree-item-icon.iconic-icon")) {
				removeIcon();
				clearRowKind();
				return;
			}
			const kind = kindForRow();
			setRowKind(kind);
			const appearance = this.icons.resolve(row.dataset.path ?? '', false, row.querySelector('.nav-file-tag')?.textContent?.trim());
			if (iconSlot && row.contains(iconSlot) && iconSlot.dataset.fileKind === kind) {
				paintIdentity(iconSlot, appearance);
				paintFileSelectionColor(row, appearance); return;
			}
			removeIcon();

			const content = row.querySelector<HTMLElement>(":scope > .nav-file-title-content");
			if (!content) return;
			iconSlot = this.createFileIconSlot(row.ownerDocument, kind);
			paintIdentity(iconSlot, appearance);
			row.insertBefore(iconSlot, content);
			paintFileSelectionColor(row, appearance);
		};

		refresh();
		return {
			refresh,
			cleanup: () => {
				removeIcon();
				clearRowKind();
			},
		};
	}

	private findFolderIndicator(row: HTMLElement): HTMLElement | null {
		return row.querySelector<HTMLElement>(
			":scope > .tree-item-icon.collapse-icon, :scope > .nav-folder-collapse-indicator"
		);
	}

	private decorateFolderIndicator(row: HTMLElement): FolderIndicatorController | null {
		// Iconic already owns this visual slot. Keep its semantic icon and only
		// add our trailing actions, rather than starting a DOM tug of war.
		if (row.querySelector(".iconic-sidekick, .tree-item-icon.iconic-icon")) return null;

		const indicator = this.findFolderIndicator(row);
		if (!indicator) return null;

		const originalNodes = Array.from(indicator.childNodes, (node) => node.cloneNode(true));
		let mode: "folder-closed" | "folder-open" | "disclosure" | null = null;
		const restoreNativeDisclosure = (): void => {
			const owned = indicator.querySelector('.ncl-file-identity-glyph, .ncl-notion-disclosure-triangle');
			clearIdentity(indicator);
			if (!owned || hasExternalIcon(row)) {
				indicator.querySelector('.ncl-notion-disclosure-triangle')?.remove();
			} else if (originalNodes.length > 0) {
				indicator.replaceChildren(...originalNodes.map((node) => node.cloneNode(true)));
			} else {
				setIcon(indicator, "right-triangle");
			}
			indicator.classList.remove("ncl-native-folder-icon-idle", "ncl-native-folder-disclosure");
			mode = null;
		};
		const showFolderIcon = (): void => {
			const expanded = !this.folderIsCollapsed(row);
			const nextMode = expanded ? "folder-open" : "folder-closed";
			if (mode !== nextMode) indicator.replaceChildren();
			paintIdentity(indicator, this.icons.resolve(row.dataset.path ?? '', true, '', expanded));
			// Even an unchanged classList.add/remove emits an attribute mutation
			// in Chromium, which would wake our own row observer every frame.
			if (!indicator.classList.contains("ncl-native-folder-icon-idle")) {
				indicator.classList.add("ncl-native-folder-icon-idle");
			}
			if (indicator.classList.contains("ncl-native-folder-disclosure")) {
				indicator.classList.remove("ncl-native-folder-disclosure");
			}
			mode = nextMode;
		};
		const showNotionDisclosure = (): void => {
			if (mode === "disclosure" && indicator.querySelector(":scope > .ncl-notion-disclosure-triangle")) return;
			clearIdentity(indicator);
			const svg = row.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "svg");
			svg.classList.add("ncl-notion-disclosure-triangle");
			svg.setAttribute("viewBox", "0 0 10 10");
			svg.setAttribute("aria-hidden", "true");
			svg.setAttribute("focusable", "false");
			const path = row.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "path");
			path.setAttribute("d", "M2 1.25L8 5L2 8.75Z");
			svg.append(path);
			indicator.replaceChildren(svg);
			indicator.classList.remove("ncl-native-folder-icon-idle");
			indicator.classList.add("ncl-native-folder-disclosure");
			mode = "disclosure";
		};
		const hasKeyboardFocus = (): boolean => row.contains(row.ownerDocument.activeElement);
		const revealDisclosure = (): void => showNotionDisclosure();
		const restoreIdleIfAppropriate = (): void => {
			if (!row.matches(":hover") && !hasKeyboardFocus()) showFolderIcon();
		};
		const refresh = (): void => {
			if (row.matches(":hover") || hasKeyboardFocus()) revealDisclosure();
			else showFolderIcon();
		};

		const onPointerEnter = (): void => revealDisclosure();
		const onPointerLeave = (): void => restoreIdleIfAppropriate();
		const onFocusIn = (): void => revealDisclosure();
		const onFocusOut = (): void => queueMicrotask(restoreIdleIfAppropriate);

		row.addEventListener("pointerenter", onPointerEnter);
		row.addEventListener("pointerleave", onPointerLeave);
		row.addEventListener("focusin", onFocusIn);
		row.addEventListener("focusout", onFocusOut);

		refresh();

		return {
			indicator,
			refresh,
			cleanup: () => {
				row.removeEventListener("pointerenter", onPointerEnter);
				row.removeEventListener("pointerleave", onPointerLeave);
				row.removeEventListener("focusin", onFocusIn);
				row.removeEventListener("focusout", onFocusOut);
				restoreNativeDisclosure();
			},
		};
	}

	private openNativeContextMenu(row: HTMLElement, anchor: HTMLElement): void {
		const rect = anchor.getBoundingClientRect();
		const ownerWindow = row.ownerDocument.defaultView ?? window;
		row.dispatchEvent(new ownerWindow.MouseEvent("contextmenu", {
			bubbles: true,
			cancelable: true,
			view: ownerWindow,
			button: 2,
			clientX: rect.right,
			clientY: rect.bottom,
		}));
	}

	private async createNoteInFolder(folderPath: string, folderRow: HTMLElement): Promise<void> {
		if (this.foldersCreating.has(folderPath)) return;
		const folder = this.app.vault.getAbstractFileByPath(folderPath);
		if (!(folder instanceof TFolder)) {
			new Notice(localize("这个文件夹已不存在，请刷新文件列表后再试。"));
			return;
		}

		this.foldersCreating.add(folderPath);
		try {
			await this.ensureFolderExpanded(folderRow);
			const path = nextAvailableMarkdownPath(
				folder.path,
				(candidate) => this.app.vault.getAbstractFileByPath(candidate) !== null
			);
			const file = await this.app.vault.create(path, "");
			const leaf = this.app.workspace.getLeaf(false);
			await leaf.openFile(file);
			await this.revealNewFileRow(folderRow, file.path);
			this.focusInlineTitle(leaf);
		} catch (error) {
			console.error("[Keyline] Failed to create a note from the File Explorer row", error);
			new Notice(localize("新建笔记失败；原文件没有被改动。"));
		} finally {
			this.foldersCreating.delete(folderPath);
		}
	}

	private folderIsCollapsed(folderRow: HTMLElement): boolean {
		const folder = folderRow.closest<HTMLElement>(".nav-folder");
		const indicator = this.findFolderIndicator(folderRow);
		return folder?.classList.contains("is-collapsed") === true
			|| indicator?.classList.contains("is-collapsed") === true;
	}

	private async ensureFolderExpanded(folderRow: HTMLElement): Promise<void> {
		if (!this.folderIsCollapsed(folderRow)) return;
		const indicator = this.findFolderIndicator(folderRow);
		if (!indicator) return;

		indicator.click();
		await this.nextFrame(folderRow.ownerDocument);
		if (!this.folderIsCollapsed(folderRow)) return;

		// Fallback for a future core DOM where the row, rather than its indicator,
		// owns the disclosure click. It is used only if the first attempt left the
		// native collapsed state unchanged.
		const ownerWindow = folderRow.ownerDocument.defaultView ?? window;
		folderRow.dispatchEvent(new ownerWindow.MouseEvent("click", {
			bubbles: true,
			cancelable: true,
			view: ownerWindow,
			button: 0,
		}));
		await this.nextFrame(folderRow.ownerDocument);
	}

	private async revealNewFileRow(folderRow: HTMLElement, path: string): Promise<void> {
		const root = folderRow.closest<HTMLElement>(".workspace-leaf-content[data-type=\"file-explorer\"]")
			?? folderRow.ownerDocument.body;
		let fileRow: HTMLElement | null = null;

		for (let frame = 0; frame < 60 && !fileRow; frame += 1) {
			fileRow = Array.from(root.querySelectorAll<HTMLElement>(".nav-file-title"))
				.find((candidate) => candidate.dataset.path === path) ?? null;
			if (!fileRow) await this.nextFrame(folderRow.ownerDocument);
		}
		if (!fileRow) return;

		fileRow.scrollIntoView({ behavior: "auto", block: "nearest", inline: "nearest" });
		if (!fileRow.classList.contains("is-active")) {
			const ownerWindow = fileRow.ownerDocument.defaultView ?? window;
			fileRow.dispatchEvent(new ownerWindow.MouseEvent("click", {
				bubbles: true,
				cancelable: true,
				view: ownerWindow,
				button: 0,
			}));
		}
	}

	private nextFrame(doc: Document): Promise<void> {
		const ownerWindow = doc.defaultView ?? window;
		return new Promise((resolve) => ownerWindow.requestAnimationFrame(() => resolve()));
	}

	private focusInlineTitle(leaf: WorkspaceLeaf): void {
		const doc = leaf.view.containerEl.ownerDocument;
		const ownerWindow = doc.defaultView ?? window;
		ownerWindow.requestAnimationFrame(() => ownerWindow.requestAnimationFrame(() => {
			const title = leaf.view.containerEl.querySelector<HTMLElement>(".inline-title");
			if (!title) return;
			title.focus();
			const selection = doc.getSelection();
			if (!selection) return;
			const range = doc.createRange();
			range.selectNodeContents(title);
			selection.removeAllRanges();
			selection.addRange(range);
		}));
	}
}
