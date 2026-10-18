import { localize } from './locale/ui';
import { EditorSelection, Transaction } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { Editor, Notice, Plugin, TAbstractFile, TFolder } from 'obsidian';
import { BlockPluginSettings, DEFAULT_SETTINGS, BlockPluginSettingTab } from './settings';
import { blockHandlesExtension } from './blockHandles';
import { findAllSuspiciousMarkers, hideSyntaxExtension } from './hideSyntax';
import { nextSuspiciousMarker } from './syntaxAnalysis';
import { blockSelectionExtension } from './blockSelection';
import { blockKeymapExtension } from './blockKeymap';
import { slashMenuExtension } from './slashMenu';
import { blockFoldExtension } from './blockFold';
import { showNotionBlockInsertMenu } from './notionInsertMenu';
import { t } from './locale/helpers';
import { selectionToolbarExtension } from './selectionToolbar';
import { FloatingSurfaceCoordinator } from './surfaceCoordinator';
import { NativeFileExplorerEnhancer } from './nativeFileExplorer';
import {
    normalizeThemeLayoutSettings,
    themeLayoutCssVariables,
} from './themeLayout';
import { wikilinkInputExtension } from './wikilinkInput';
import { mentionMenuExtension } from './mentionMenu';
import { styledBlocksExtension } from './styledBlocks';
import { editorLayoutExtension } from './editorLayout';
import { editableListSeparatorExtension } from './listSeparator';
import { FileIconManager } from './fileIconManager';
import { ShellControls } from './shellControls';
import { HintPresentation } from './hintPresentation';
import { WorkspaceSwitcher, workspaceRecoveryStore } from './workspaceSwitcher';
import { FileIconModal } from './fileIconModal';
import { ICON_DEFAULTS, IconKind, moveFileIconOverrides, normalizeFileIconSettings, resolveFileIcon } from './fileIconModel';

export default class NotionBlock extends Plugin {
    settings: BlockPluginSettings;
    readonly surfaceCoordinator = new FloatingSurfaceCoordinator();
    syntaxPresentationGeneration = 0;
    private optionRevealActive = false;
    private manualRevealActive = false;
    private nativeFileExplorer: NativeFileExplorerEnhancer | null = null;
    private fileIcons: FileIconManager | null = null;
    private shellControls: ShellControls | null = null;
    private workspaceSwitcher: WorkspaceSwitcher | null = null;
    private readonly hintPresentations = new Map<Document, HintPresentation>();
    private readonly styledDocuments = new Set<Document>();
    private themeLayoutSaveTimer: number | null = null;
    private themeLayoutMeasureFrame: number | null = null;

    get syntaxRevealActive(): boolean {
        return this.optionRevealActive || this.manualRevealActive;
    }

    async onload() {
        await this.loadSettings();
        this.applyThemeLayoutSettings();
        this.refreshInterfacePresentation();


        this.fileIcons = new FileIconManager(this.app, () => this.settings.fileIcons);
        this.nativeFileExplorer = new NativeFileExplorerEnhancer(this.app, this.fileIcons);
        this.shellControls = new ShellControls(document);
        this.workspaceSwitcher = new WorkspaceSwitcher(this.app, document,
            workspaceRecoveryStore(this.app, this.manifest.dir ?? `${this.app.vault.configDir}/plugins/${this.manifest.id}`),
            this.surfaceCoordinator, () => this.settings.workspaceSwitcher, () => this.addStatusBarItem());
        this.app.workspace.onLayoutReady(() => { this.fileIcons?.start(); this.syncNativeFileExplorer(); this.shellControls?.start(); this.workspaceSwitcher?.start(); });
        this.registerEvent(this.app.workspace.on('css-change', () => { this.shellControls?.refresh(); this.workspaceSwitcher?.refresh(); this.refreshInterfacePresentation(); }));
        this.registerEvent(this.app.workspace.on('layout-change', () => {
            this.applyThemeLayoutSettings();
            this.nativeFileExplorer?.refresh();
            this.fileIcons?.refresh();
            this.shellControls?.refresh();
            this.workspaceSwitcher?.refresh();
            this.refreshInterfacePresentation();
        }));
        this.registerEvent(this.app.workspace.on('file-open', () => this.refreshFileIcons()));
        this.registerEvent(this.app.workspace.on('active-leaf-change', () => this.refreshFileIcons()));
        this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
            if (moveFileIconOverrides(this.settings.fileIcons, oldPath, file.path)) void this.saveFileIconSettings();
            else this.refreshFileIcons();
        }));
        this.registerEvent(this.app.vault.on('delete', file => {
            if (moveFileIconOverrides(this.settings.fileIcons, file.path, null)) void this.saveFileIconSettings();
            else this.refreshFileIcons();
        }));

        // Core still constructs every file/folder menu, including menus opened
        // by our trailing ellipsis. Registering the menu with the same surface
        // coordinator keeps it mutually exclusive with editor menus without
        // copying or filtering Obsidian's commands.
        this.registerEvent(this.app.workspace.on('file-menu', (menu, file, _source, leaf) => {
            if (this.fileIcons?.ownsIcons()) {
                menu.addItem(item => item.setTitle(localize('更改图标…')).setIcon('palette').onClick(() => this.editFileIcon(file)));
            }
            const ownerDocument = leaf?.view.containerEl.ownerDocument ?? document;
            const lease = this.surfaceCoordinator.claim(
                ownerDocument,
                'native-menu',
                () => menu.hide()
            );
            menu.onHide(() => lease.release());
        }));

        // Register the CodeMirror 6 extension for hover handles
        this.registerEditorExtension([
            blockHandlesExtension(this),
            hideSyntaxExtension(this),
            editorLayoutExtension(),
            editableListSeparatorExtension(this),
            styledBlocksExtension(this),
            selectionToolbarExtension(this),
            blockSelectionExtension(this),
            blockKeymapExtension(this),
            slashMenuExtension(this),
            wikilinkInputExtension(this),
            mentionMenuExtension(this),
            blockFoldExtension(),
        ]);

        // The same menu the "+" handle and the trigger character open, exposed
        // as a command so it can be given a real hotkey under Settings →
        // Hotkeys rather than only a typed character.
        this.addCommand({
            id: 'switch-workspace-layout', name: localize('切换工作区布局'), callback: () => this.workspaceSwitcher?.openMenu(),
        });
        this.addCommand({
            id: 'save-workspace-layout', name: localize('保存当前工作区布局'), callback: () => this.workspaceSwitcher?.saveCurrent(),
        });
        this.addCommand({
            id: 'save-workspace-layout-as', name: localize('另存为新工作区布局'), callback: () => this.workspaceSwitcher?.saveAs(),
        });
        this.addCommand({
            id: 'restore-workspace-layout', name: localize('恢复切换前工作区布局'), callback: () => this.workspaceSwitcher?.restore(),
        });

        this.addCommand({
            id: 'change-current-file-icon',
            name: localize('更改当前文件图标'),
            checkCallback: checking => {
                const file = this.app.workspace.getActiveFile();
                if (!file || !this.fileIcons?.ownsIcons()) return false;
                if (!checking) this.editFileIcon(file);
                return true;
            },
        });

        this.addCommand({
            id: 'open-insert-menu',
            name: t('command.openInsertMenu'),
            editorCallback: (editor: Editor) => this.openInsertMenuAtCursor(editor),
        });

        this.addCommand({
            id: 'toggle-markdown-source-markers',
            name: localize('切换 Markdown 源码符号显示'),
            editorCallback: () => {
                this.manualRevealActive = !this.manualRevealActive;
                this.refreshSyntaxPresentation();
                new Notice(this.manualRevealActive
                    ? localize('已显示 Markdown 源码符号')
                    : localize('已恢复隐藏生效的 Markdown 符号'));
            },
        });

        this.addCommand({
            id: 'go-to-next-suspicious-markdown-marker',
            name: localize('跳转到下一个可疑 Markdown 符号'),
            editorCallback: (editor: Editor) => this.goToNextSuspiciousMarker(editor),
        });

        this.registerDomEvent(document, 'keydown', (event: KeyboardEvent) => {
            if (event.key === 'Alt' && this.settings.revealSyntaxWithOption) {
                this.setOptionReveal(true);
            }
        });
        this.registerDomEvent(document, 'keyup', (event: KeyboardEvent) => {
            if (event.key === 'Alt') this.setOptionReveal(false);
        });
        this.registerDomEvent(window, 'blur', () => this.setOptionReveal(false));
        this.registerDomEvent(document, 'visibilitychange', () => {
            if (document.hidden) this.setOptionReveal(false);
        });

        // Add settings tab
        this.addSettingTab(new BlockPluginSettingTab(this.app, this));

    }

    onunload() {
        if (this.themeLayoutSaveTimer !== null) {
            window.clearTimeout(this.themeLayoutSaveTimer);
            this.themeLayoutSaveTimer = null;
            void this.saveData(this.settings);
        }
        if (this.themeLayoutMeasureFrame !== null) {
            window.cancelAnimationFrame(this.themeLayoutMeasureFrame);
            this.themeLayoutMeasureFrame = null;
        }
        this.nativeFileExplorer?.stop();
        this.nativeFileExplorer = null;
        this.fileIcons?.stop();
        this.fileIcons = null;
        this.shellControls?.stop();
        this.shellControls = null;
        this.workspaceSwitcher?.stop();
        this.workspaceSwitcher = null;
        for (const presentation of this.hintPresentations.values()) presentation.stop();
        this.hintPresentations.clear();
        this.clearThemeLayoutSettings();
        this.surfaceCoordinator.closeAll('unload');
        this.optionRevealActive = false;
        this.manualRevealActive = false;
    }

    private goToNextSuspiciousMarker(editor: Editor): void {
        const view = (editor as unknown as { cm?: EditorView }).cm;
        if (!view) return;

        const warnings = findAllSuspiciousMarkers(view.state);
        if (warnings === null) {
            new Notice(localize('笔记还在解析中，请稍后再试。'));
            return;
        }
        const next = nextSuspiciousMarker(warnings, view.state.selection.main.head);
        if (!next) {
            new Notice(localize('未发现可疑的 Markdown 成对符号。'));
            return;
        }

        view.dispatch({
            selection: EditorSelection.range(next.from, next.to),
            scrollIntoView: true,
        });
        view.focus();
        new Notice(next.message);
    }

    private setOptionReveal(active: boolean): void {
        if (this.optionRevealActive === active) return;
        this.optionRevealActive = active;
        this.refreshSyntaxPresentation();
    }

    private refreshSyntaxPresentation(): void {
        this.syntaxPresentationGeneration += 1;
        this.app.workspace.updateOptions();
    }

    private openInsertMenuAtCursor(editor: Editor): void {
        const view = (editor as unknown as { cm?: EditorView }).cm;
        if (!view) return;

        const head = view.state.selection.main.head;
        const coords = view.coordsAtPos(head);
        if (!coords) return;

        showNotionBlockInsertMenu(
            this,
            view,
            view.state.doc.lineAt(head).number,
            { x: coords.left, y: coords.bottom + 6 },
            { avoid: { top: coords.top, bottom: coords.bottom }, keepEditorFocus: true }
        );
    }

    async loadSettings() {
        const data = await this.loadData() as Partial<BlockPluginSettings> | null;
        this.settings = {
            ...DEFAULT_SETTINGS,
            ...data,
            themeLayout: normalizeThemeLayoutSettings(data?.themeLayout),
            fileIcons: normalizeFileIconSettings(data?.fileIcons),
            showHoverHints: data?.showHoverHints === true,
        };
    }

    async saveSettings() {
        if (this.themeLayoutSaveTimer !== null) {
            window.clearTimeout(this.themeLayoutSaveTimer);
            this.themeLayoutSaveTimer = null;
        }
        if (!this.settings.revealSyntaxWithOption) this.optionRevealActive = false;
        this.settings.themeLayout = normalizeThemeLayoutSettings(this.settings.themeLayout);
        this.applyThemeLayoutSettings();
        this.syncNativeFileExplorer();
        this.refreshFileIcons();
        this.workspaceSwitcher?.refresh();
        this.refreshInterfacePresentation();
        await this.saveData(this.settings);
        this.refreshSyntaxPresentation();
    }

    /** Follow active windows/theme changes without polling or mutating notes. */
    refreshInterfacePresentation(extraDocument?: Document): void {
        const documents = new Set<Document>([document]);
        if (extraDocument) documents.add(extraDocument);
        this.app.workspace.iterateAllLeaves(leaf => documents.add(leaf.view.containerEl.ownerDocument));
        for (const [doc, presentation] of this.hintPresentations) {
            if (!doc.defaultView || doc.defaultView.closed) { presentation.stop(); this.hintPresentations.delete(doc); }
            else documents.add(doc);
        }
        for (const doc of documents) {
            let presentation = this.hintPresentations.get(doc);
            if (!presentation) { presentation = new HintPresentation(doc); this.hintPresentations.set(doc, presentation); }
            presentation.refresh(this.settings.showHoverHints);
        }
    }

    /** Live-preview a slider change, then persist the last value in the burst. */
    queueThemeLayoutSettingsSave(): void {
        this.settings.themeLayout = normalizeThemeLayoutSettings(this.settings.themeLayout);
        this.applyThemeLayoutSettings();
        if (this.themeLayoutSaveTimer !== null) window.clearTimeout(this.themeLayoutSaveTimer);
        this.themeLayoutSaveTimer = window.setTimeout(() => {
            this.themeLayoutSaveTimer = null;
            void this.saveData(this.settings);
        }, 140);
    }

    /** Reset is a discrete action, so it is committed before the button returns. */
    async saveThemeLayoutSettingsNow(): Promise<void> {
        if (this.themeLayoutSaveTimer !== null) {
            window.clearTimeout(this.themeLayoutSaveTimer);
            this.themeLayoutSaveTimer = null;
        }
        this.settings.themeLayout = normalizeThemeLayoutSettings(this.settings.themeLayout);
        this.applyThemeLayoutSettings();
        await this.saveData(this.settings);
    }

    private syncNativeFileExplorer(): void {
        if (!this.nativeFileExplorer) return;
        if (this.settings.nativeFileExplorerEnhancements) this.nativeFileExplorer.start();
        else this.nativeFileExplorer.stop();
    }

    private refreshFileIcons(): void {
        this.fileIcons?.refresh();
        this.nativeFileExplorer?.refresh();
    }

    async saveFileIconSettings(): Promise<void> {
        this.settings.fileIcons = normalizeFileIconSettings(this.settings.fileIcons);
        await this.saveData(this.settings);
        this.refreshFileIcons();
    }

    editFileIcon(file: TAbstractFile): void {
        if (!this.fileIcons?.ownsIcons()) return;
        const settings = normalizeFileIconSettings(this.settings.fileIcons);
        const initial = settings.files[file.path] ?? {};
        delete settings.files[file.path];
        new FileIconModal(this.app, {
            title: file.path,
            initial,
            base: resolveFileIcon(settings, file.path, file instanceof TFolder),
            monochrome: settings.monochrome,
            save: async value => {
                if (!this.fileIcons?.ownsIcons()) throw new Error(localize('图标已交由其他插件管理'));
                if (this.app.vault.getAbstractFileByPath(file.path) !== file) throw new Error(localize('文件已被删除'));
                if (Object.keys(value).length) this.settings.fileIcons.files[file.path] = value;
                else delete this.settings.fileIcons.files[file.path];
                await this.saveFileIconSettings();
            },
        }).open();
    }

    editFileIconType(kind: IconKind): void {
        const builtin = ICON_DEFAULTS[kind];
        new FileIconModal(this.app, {
            title: localize`${builtin.label} · 类型默认`,
            initial: this.settings.fileIcons.types[kind] ?? {},
            base: { ...builtin, kind, iconSource: localize('内置默认'), colorSource: localize('内置默认') },
            monochrome: this.settings.fileIcons.monochrome,
            save: async value => {
                if (Object.keys(value).length) this.settings.fileIcons.types[kind] = value;
                else delete this.settings.fileIcons.types[kind];
                await this.saveFileIconSettings();
            },
        }).open();
    }

    private applyThemeLayoutSettings(): void {
        const variables = themeLayoutCssVariables(this.settings.themeLayout);
        const documents = new Set<Document>([document]);
        this.app.workspace.iterateAllLeaves((leaf) => {
            documents.add(leaf.view.containerEl.ownerDocument);
        });

        for (const doc of documents) {
            const target = doc.body;
            if (!target) continue;
            for (const [name, value] of Object.entries(variables)) {
                target.style.setProperty(name, value);
            }
            this.styledDocuments.add(doc);
        }
        this.scheduleThemeLayoutRemeasure();
    }

    /**
     * CSS layout changes must invalidate both the height map and the detached
     * cursor layer. CodeMirror detects vertical changes during measurement,
     * but a separator-width-only change does not set geometryChanged. A same-
     * selection transaction redraws that native cursor layer without changing
     * content, focus, undo history, or logical caret position.
     */
    private scheduleThemeLayoutRemeasure(): void {
        if (this.themeLayoutMeasureFrame !== null) return;
        this.themeLayoutMeasureFrame = window.requestAnimationFrame(() => {
            this.themeLayoutMeasureFrame = null;
            this.app.workspace.iterateAllLeaves((leaf) => {
                const editor = (leaf.view as unknown as { editor?: Editor }).editor;
                const view = (editor as unknown as { cm?: EditorView } | undefined)?.cm;
                if (!view) return;
                view.dispatch({
                    selection: view.state.selection,
                    annotations: Transaction.addToHistory.of(false),
                });
                view.requestMeasure();
            });
        });
    }

    private clearThemeLayoutSettings(): void {
        const names = Object.keys(themeLayoutCssVariables(DEFAULT_SETTINGS.themeLayout));
        for (const doc of this.styledDocuments) {
            const target = doc.body;
            if (!target) continue;
            for (const name of names) target.style.removeProperty(name);
        }
        this.styledDocuments.clear();
    }
}
