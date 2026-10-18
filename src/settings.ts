import { localize } from './locale/ui';
import { App, Notice, PluginSettingTab, Setting, setIcon } from 'obsidian';
import type NotionBlock from './main';
import { SETTINGS_SECTIONS, SettingsSectionId, findSettingsSections, matchesSettingsSearch } from './settingsNavigation';
import { readNativeMenuPreference, writeNativeMenuPreference } from './menuPreference';
import { t } from './locale/helpers';
import {
    BUILTIN_ITEMS,
    CustomInsertItem,
    InsertLayout,
    addCustomItem,
    applyOrder,
    removeCustomItem,
    reorderIds,
    resetItemLayout,
    resolveMenuItems,
    setItemHidden,
    updateCustomItem,
} from './insertRegistry';
import { InsertCommandModal } from './insertCommandModal';
import { FileIconSettings, ICON_DEFAULTS, IconKind, normalizeFileIconSettings } from './fileIconModel';
import {
    DEFAULT_THEME_LAYOUT_SETTINGS,
    THEME_LAYOUT_SETTING_SPECS,
    ThemeLayoutSettingKey,
    ThemeLayoutSettings,
    formatThemeLayoutValue,
    normalizeThemeLayoutSettings,
} from './themeLayout';

export interface BlockPluginSettings {
    enabled: boolean;
    /** Enhance core File Explorer rows without replacing the native tree. */
    nativeFileExplorerEnhancements: boolean;
    /** Quiet central status-bar entry; named layouts remain owned by core. */
    workspaceSwitcher: boolean;
    /** Standard hover descriptions only; never hides warnings/link previews. */
    showHoverHints: boolean;
    fileIcons: FileIconSettings;
    /** Legacy display preference retained for the standalone plugin's import. */
    marginalia: boolean;
    /** CSS variables consumed by the matching Keyline theme. */
    themeLayout: ThemeLayoutSettings;
    dragGranularity: 'line' | 'paragraph';
    hoverDelay: number;
    hideDelay: number;
    /** Which edge of the content the hover handle is drawn beside. */
    handleSide: 'left' | 'right';
    /** Pin the handle to the caret's block so it never hides on pointer-out. */
    handleAlwaysVisible: boolean;
    /** Show the fold chevron on the hover handle. */
    foldHandle: boolean;
    dateFormat: string;
    timeFormat: string;
    /** Hide markdown syntax markers on the active line too, killing reflow. */
    hideSyntaxMarkers: boolean;
    /** Keep unparsed delimiter runs visible and mark them as suspicious. */
    guardSuspiciousSyntax: boolean;
    /** Passive @ date/page suggestions; fullwidth brackets use native Wikilinks. */
    wikilinkInputAliases: boolean;
    /** Temporarily reveal Obsidian's native source markers while Option is held. */
    revealSyntaxWithOption: boolean;
    /** Show a short non-modal notice when pasted text introduces warnings. */
    notifyOnPaste: boolean;
    /** Replace Make.md's compact styler with the richer selected-text toolbar. */
    selectionToolbar: boolean;
    /** Expand a multi-block drag selection to whole blocks, as Notion does. */
    snapSelectionToBlocks: boolean;
    /** Cmd+A escalation and Backspace-at-block-start. */
    blockKeys: boolean;
    /** Show the "+" button on the hover handle. */
    plusHandle: boolean;
    /** Open the insert menu by typing a trigger character on an empty block. */
    slashMenu: boolean;
    /** The character that opens it. */
    slashTrigger: string;
    /** Also open it mid-line, after a space, rather than on empty blocks only. */
    slashInline: boolean;
    /** Insert-menu item ids in the order the user chose. Empty means the default order. */
    insertOrder: string[];
    /** Insert-menu item ids the user turned off. */
    insertHidden: string[];
    /** Insert-menu rows the user added, each bound to an Obsidian command. */
    insertCustom: CustomInsertItem[];
    /** Write inserted attachments as embeds (a leading "!") rather than links. */
    embedAttachments: boolean;
}

export const DEFAULT_SETTINGS: BlockPluginSettings = {
    enabled: true,
    nativeFileExplorerEnhancements: true,
    workspaceSwitcher: true,
    showHoverHints: false,
    fileIcons: normalizeFileIconSettings(),
    marginalia: true,
    themeLayout: { ...DEFAULT_THEME_LAYOUT_SETTINGS },
    // Notion drags whole blocks, not single lines. A wrapped paragraph is one
    // block to the reader, so 'line' meant grabbing a paragraph moved a
    // fragment of it and left the rest behind.
    dragGranularity: 'paragraph',
    // A tiny dwell prevents handles from flashing as the pointer crosses the
    // page while remaining well below a consciously perceived delay.
    hoverDelay: 90,
    // Raised from 200ms. It has to cover the pointer's pause between leaving
    // a line and arriving at the handle, which is what made the handle feel
    // like it vanished the moment attention moved to it.
    hideDelay: 260,
    handleSide: 'left',
    // OFF by default: it changes the handle from a hover affordance into a
    // permanent one, which is a different editor to look at.
    handleAlwaysVisible: false,
    // OFF by default: it adds a third button to the hover handle, which is a
    // visible change to every line you point at rather than an opt-in feature.
    foldHandle: false,
    dateFormat: 'YYYY-MM-DD',
    timeFormat: 'HH:mm',
    // Parser-confirmed markers only. Invalid raw delimiters remain visible.
    hideSyntaxMarkers: true,
    guardSuspiciousSyntax: true,
    wikilinkInputAliases: true,
    revealSyntaxWithOption: true,
    notifyOnPaste: true,
    selectionToolbar: true,
    // The lab intentionally tests Notion-like cross-block selection. This is
    // isolated from the standalone NMG, whose safer default remains off.
    snapSelectionToBlocks: true,
    blockKeys: true,
    plusHandle: true,
    slashMenu: true,
    slashTrigger: '/',
    slashInline: true,
    // Empty rather than the built-in order: resolveMenuItems appends anything
    // an order does not name, so an empty order IS the built-in order, and
    // storing it explicitly would freeze out rows added by later versions.
    insertOrder: [],
    insertHidden: [],
    insertCustom: [],
    // OFF by default, as asked: an attachment reads as a link unless it is
    // explicitly meant to render inline.
    embedAttachments: false,
};

export class BlockPluginSettingTab extends PluginSettingTab {
    plugin: NotionBlock;

    /** The insert-menu list, repainted on its own so display() is never needed. */
    private insertListEl: HTMLElement | null = null;
    /** The theme controls repaint independently when defaults are restored. */
    private themeLayoutPanelEl: HTMLElement | null = null;
    private section: SettingsSectionId = 'interface';
    private beforeSearch: SettingsSectionId = 'interface';
    private query = '';
    private panels = new Map<SettingsSectionId, HTMLElement>();
    private navButtons = new Map<SettingsSectionId, HTMLButtonElement>();
    private contentEl: HTMLElement | null = null;
    private selectEl: HTMLSelectElement | null = null;
    private emptyEl: HTMLElement | null = null;
    private resize: ResizeObserver | null = null;

    constructor(app: App, plugin: NotionBlock) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        this.resize?.disconnect();
        containerEl.empty();
        containerEl.addClass('ncl-settings');
        this.panels.clear(); this.navButtons.clear(); this.query = '';
        this.insertListEl = this.themeLayoutPanelEl = null;
        const header = containerEl.createDiv({ cls: 'ncl-settings-header' });
        header.createEl('h2', { text: 'Keyline' });
        header.createSpan({ cls: 'ncl-settings-version', text: this.plugin.manifest.version });
        const search = header.createEl('input', { cls: 'ncl-settings-search', attr: { type: 'search', placeholder: localize('搜索设置'), 'aria-label': localize('搜索 Keyline 设置') } });
        const shell = containerEl.createDiv({ cls: 'ncl-settings-shell' });
        const nav = shell.createEl('nav', { cls: 'ncl-settings-nav', attr: { 'aria-label': localize('设置分类') } });
        this.selectEl = containerEl.createEl('select', { cls: 'dropdown ncl-settings-select', attr: { 'aria-label': localize('设置分类') } });
        header.after(this.selectEl);
        for (const item of SETTINGS_SECTIONS) {
            const button = nav.createEl('button', { cls: 'ncl-settings-tab', attr: { type: 'button' } });
            const icon = button.createSpan({ cls: 'ncl-settings-tab-icon', attr: { 'aria-hidden': 'true' } });
            setIcon(icon, item.icon); button.createSpan({ text: item.label });
            button.dataset.section = item.id;
            button.addEventListener('click', () => this.showSection(item.id));
            button.addEventListener('keydown', event => {
                if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
                event.preventDefault();
                const visible = [...this.navButtons.values()].filter(b => !b.hidden);
                const index = visible.indexOf(button);
                const next = event.key === 'Home' ? 0 : event.key === 'End' ? visible.length - 1 :
                    (index + (event.key === 'ArrowDown' ? 1 : -1) + visible.length) % visible.length;
                visible[next]?.focus(); visible[next]?.click();
            });
            this.navButtons.set(item.id, button);
            this.selectEl.createEl('option', { text: item.label, value: item.id });
        }
        this.selectEl.addEventListener('change', () => this.showSection(this.selectEl!.value as SettingsSectionId));
        this.contentEl = shell.createDiv({ cls: 'ncl-settings-content' });
        this.emptyEl = this.contentEl.createDiv({ cls: 'ncl-settings-empty', text: localize('没有匹配的设置'), attr: { role: 'status' } });
        this.emptyEl.hidden = true;
        search.addEventListener('input', () => {
            if (!this.query) this.beforeSearch = this.section;
            this.query = search.value.trim();
            const matches = findSettingsSections(this.query);
            for (const [id, button] of this.navButtons) button.hidden = !matches.includes(id);
            for (const option of Array.from(this.selectEl!.options)) option.hidden = !matches.includes(option.value as SettingsSectionId);
            if (!this.query) this.showSection(this.beforeSearch);
            else if (matches.length) this.showSection(matches.includes(this.section) ? this.section : matches[0]);
            else { for (const panel of this.panels.values()) panel.hidden = true; this.emptyEl!.hidden = false; }
            this.selectEl!.disabled = !matches.length;
        });
        search.addEventListener('keydown', event => {
            if (event.key !== 'Escape' || !search.value) return;
            event.preventDefault(); event.stopPropagation(); search.value = '';
            search.dispatchEvent(new Event('input'));
        });
        const win = containerEl.ownerDocument.defaultView as Window & typeof globalThis;
        const updateWidth = () => {
            const narrow = containerEl.getBoundingClientRect().width < 640;
            if (containerEl.classList.contains('is-narrow') !== narrow) containerEl.classList.toggle('is-narrow', narrow);
        };
        this.resize = new win.ResizeObserver(updateWidth); this.resize.observe(containerEl); updateWidth();
        this.showSection(this.section);
        this.plugin.refreshInterfacePresentation(containerEl.ownerDocument);
    }

    hide(): void {
        this.resize?.disconnect(); this.resize = null;
        this.containerEl.removeClass('ncl-settings', 'is-narrow');
        this.panels.clear(); this.navButtons.clear();
        this.insertListEl = this.themeLayoutPanelEl = this.contentEl = this.emptyEl = null;
        this.selectEl = null;
    }

    private showSection(id: SettingsSectionId): void {
        if (!this.contentEl) return;
        const item = SETTINGS_SECTIONS.find(section => section.id === id)!;
        this.section = id;
        this.emptyEl!.hidden = true;
        let panel = this.panels.get(id);
        if (!panel) {
            panel = this.contentEl.createEl('section', { cls: 'ncl-settings-panel', attr: { 'aria-label': item.label } });
            panel.dataset.section = id;
            panel.createEl('h3', { cls: 'ncl-settings-title', text: item.label });
            panel.createEl('p', { cls: 'ncl-settings-description', text: item.description });
            this.panels.set(id, panel);
            switch (id) {
                case 'interface': this.renderInterface(panel); break;
                case 'typography': this.themeLayoutPanelEl = panel.createDiv({ cls: 'ncl-theme-layout-panel' }); this.renderThemeLayoutPanel(); break;
                case 'icons': this.renderIcons(panel); break;
                case 'editing': this.renderEditing(panel); break;
                case 'insert': this.renderInsert(panel); break;
                case 'advanced': this.renderAdvanced(panel); break;
            }
            if (id !== 'typography') this.groupRows(panel);
        }
        for (const [key, el] of this.panels) el.hidden = key !== id;
        for (const [key, button] of this.navButtons) {
            button.classList.toggle('is-active', key === id);
            if (key === id) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
        }
        this.selectEl!.value = id;
        if (id === 'interface') {
            const menu = panel.querySelector<HTMLSelectElement>('[data-menu-preference]');
            if (menu) menu.value = readNativeMenuPreference(this.app) ? 'native' : 'keyline';
        }
        // Category-level search keeps headings, explanations and the matching
        // controls together; it never hides dependent settings or resets data.
        for (const row of Array.from(panel.querySelectorAll<HTMLElement>('.setting-item'))) {
            const match = !!this.query && matchesSettingsSearch(row.textContent ?? '', this.query);
            row.classList.toggle('is-search-match', match);
            if (match) { const details = row.closest('details'); if (details) details.open = true; }
        }
        if (this.query) panel.querySelector<HTMLElement>('.is-search-match')?.scrollIntoView({ block: 'nearest' });
    }

    private groupRows(container: HTMLElement): void {
        let items: HTMLElement | null = null;
        for (const child of Array.from(container.children)) {
            const el = child as HTMLElement;
            if (el.matches('.setting-item-heading, .ncl-theme-layout-section') && !el.querySelector('button')) {
                const group = container.ownerDocument.createElement('section');
                group.className = 'ncl-preference-group';
                group.setAttribute('aria-label', el.textContent ?? '');
                el.before(group); group.append(el);
                items = group.createDiv({ cls: 'ncl-preference-items' });
            } else if (items) items.append(el);
        }
    }

    private renderInterface(containerEl: HTMLElement): void {
        new Setting(containerEl).setName(localize('显示')).setHeading();
        new Setting(containerEl).setName(localize('悬停说明'))
            .setDesc(localize('显示按钮与工具的说明气泡。关闭不影响链接预览、错误提醒和确认弹窗。'))
            .addToggle(toggle => toggle.setValue(this.plugin.settings.showHoverHints).onChange(async value => {
                this.plugin.settings.showHoverHints = value; await this.plugin.saveSettings();
            }));
        const native = readNativeMenuPreference(this.app);
        new Setting(containerEl).setName(localize('菜单'))
            .setDesc(native === null ? localize('当前环境未提供菜单切换接口。') : localize('复用 Obsidian 的菜单设置；Keyline 使用主题样式，系统使用操作系统样式。'))
            .addDropdown(dropdown => {
                dropdown.selectEl.dataset.menuPreference = 'true';
                dropdown.addOption('keyline', 'Keyline').addOption('native', localize('系统'))
                    .setValue(native ? 'native' : 'keyline').setDisabled(native === null)
                    .onChange(async value => {
                        dropdown.setDisabled(true);
                        try { await writeNativeMenuPreference(this.app, value === 'native'); }
                        catch (error) { new Notice(error instanceof Error ? error.message : localize('菜单设置未保存')); }
                        finally { dropdown.setValue(readNativeMenuPreference(this.app) ? 'native' : 'keyline').setDisabled(readNativeMenuPreference(this.app) === null); }
                    });
            });
        new Setting(containerEl).setName(localize('导航')).setHeading();
        new Setting(containerEl)
            .setName(localize('底栏布局切换器'))
            .setDesc(localize('在 Keyline 底栏中央显示当前工作区。需开启核心插件「工作区」；不自动覆盖已保存布局，不在启动时重载布局。'))
            .addToggle(toggle => toggle.setValue(this.plugin.settings.workspaceSwitcher).onChange(async value => {
                this.plugin.settings.workspaceSwitcher = value;
                await this.plugin.saveSettings();
            }));

        new Setting(containerEl)
            .setName(localize('Keyline 文件导航'))
            .setDesc(localize('文件夹平时显示图标，悬停或键盘聚焦时恢复原生展开符号；右侧快捷按钮仍调用 Obsidian 的原生文件菜单和文件操作。'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.nativeFileExplorerEnhancements)
                .onChange(async (value) => {
                    this.plugin.settings.nativeFileExplorerEnhancements = value;
                    await this.plugin.saveSettings();
                }));

    }

    private renderIcons(containerEl: HTMLElement): void {
        new Setting(containerEl).setName(localize('显示')).setHeading();
        new Setting(containerEl)
            .setName(localize('自动文件图标'))
            .setDesc(localize('Sidebar 与 Tab 共用文件类型图标和颜色。启用 Iconic 时自动让位；关闭此项则交给其他插件。关闭不删除自定义设置。'))
            .addToggle(toggle => toggle.setValue(this.plugin.settings.fileIcons.enabled).onChange(async value => {
                this.plugin.settings.fileIcons.enabled = value;
                await this.plugin.saveFileIconSettings();
            }));
        new Setting(containerEl)
            .setName(localize('单色图标'))
            .setDesc(localize('保留不同图形，统一使用中性色。关闭后恢复已设置的类型色与自定义颜色。'))
            .addToggle(toggle => toggle.setValue(this.plugin.settings.fileIcons.monochrome).onChange(async value => {
                this.plugin.settings.fileIcons.monochrome = value;
                await this.plugin.saveFileIconSettings();
            }));
        containerEl.createEl('p', { cls: 'setting-item-description', text: localize('右键文件、文件夹或 Tab → 更改图标。也可在命令面板中更改当前文件图标。优先级：文件自定义 > 类型默认 > 内置默认；恢复自动不会修改笔记内容。') });
        const iconTypes = containerEl.createEl('details', { cls: 'ncl-icon-type-settings' });
        iconTypes.createEl('summary', { text: localize('调整各文件类型的默认图标与颜色') });
        for (const kind of Object.keys(ICON_DEFAULTS) as IconKind[]) {
            new Setting(iconTypes).setName(ICON_DEFAULTS[kind].label)
                .addButton(button => button.setButtonText(localize('更改…')).onClick(() => this.plugin.editFileIconType(kind)));
        }

    }

    private renderEditing(containerEl: HTMLElement): void {
        new Setting(containerEl).setName(localize('交互')).setHeading();

        new Setting(containerEl)
            .setName(t('settings.enablePlugin.name'))
            .setDesc(t('settings.enablePlugin.desc'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enabled)
                .onChange(async (value) => {
                    this.plugin.settings.enabled = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl).setName(localize('书写保护')).setHeading();

        new Setting(containerEl)
            .setName(localize('隐藏已生效的 Markdown 符号'))
            .setDesc(localize('仅隐藏 Obsidian 解析器已确认的强调、删除线、行内代码、标题符号和有效转义反斜杠；可疑或无效符号会留在屏幕上。'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.hideSyntaxMarkers)
                .onChange(async (value) => {
                    this.plugin.settings.hideSyntaxMarkers = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName(localize('标出可疑的成对语法'))
            .setDesc(localize('对未被解析器接受的 **、__、~~ 和反引号加波浪线，不会自动改写正文。'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.guardSuspiciousSyntax)
                .onChange(async (value) => {
                    this.plugin.settings.guardSuspiciousSyntax = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName(localize('@ 菜单与中文括号'))
            .setDesc(localize('输入 @ 搜索日期、时间或页面；选择页面后才写入 [[链接]]，取消会保留原文。邮箱不触发菜单。↑↓ 选择、Enter 插入；未选择时 Enter 正常换行。【【与】】仍等同于 [[ 与 ]]。'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.wikilinkInputAliases)
                .onChange(async (value) => {
                    this.plugin.settings.wikilinkInputAliases = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName(localize('按住 ⌥ 显示源码'))
            .setDesc(localize('按住 Option 时临时恢复 Obsidian 的原生 Markdown 符号显示，松开即返回无符号书写。'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.revealSyntaxWithOption)
                .onChange(async (value) => {
                    this.plugin.settings.revealSyntaxWithOption = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName(localize('粘贴后提醒'))
            .setDesc(localize('粘贴内容带入可疑语法时显示一条非模态提示，不打断继续输入。'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.notifyOnPaste)
                .onChange(async (value) => {
                    this.plugin.settings.notifyOnPaste = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName(localize('增强文本选择菜单'))
            .setDesc(localize('选中文本时显示段落层级、常用格式、链接、高亮与颜色；启用时替代 Make.md 的简易选择工具条。关闭后 Make.md 原菜单会自动恢复。'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.selectionToolbar)
                .onChange(async (value) => {
                    this.plugin.settings.selectionToolbar = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl).setName(localize('块编辑')).setHeading();

        new Setting(containerEl)
            .setName(t('settings.dragGranularity.name'))
            .setDesc(t('settings.dragGranularity.desc'))
            .addDropdown(dropdown => dropdown
                .addOption('line', t('settings.dragGranularity.line'))
                .addOption('paragraph', t('settings.dragGranularity.paragraph'))
                .setValue(this.plugin.settings.dragGranularity)
                .onChange(async (value: 'line' | 'paragraph') => {
                    this.plugin.settings.dragGranularity = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName(t('settings.hoverDelay.name'))
            .setDesc(t('settings.hoverDelay.desc'))
            .addSlider(slider => slider
                .setLimits(0, 500, 50)
                .setValue(this.plugin.settings.hoverDelay)
                .onChange(async (value) => {
                    this.plugin.settings.hoverDelay = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName(t('settings.hideDelay.name'))
            .setDesc(t('settings.hideDelay.desc'))
            .addSlider(slider => slider
                .setLimits(0, 1000, 50)
                .setValue(this.plugin.settings.hideDelay)
                .onChange(async (value) => {
                    this.plugin.settings.hideDelay = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName(t('settings.handleSide.name'))
            .setDesc(t('settings.handleSide.desc'))
            .addDropdown(dropdown => dropdown
                .addOption('left', t('settings.handleSide.left'))
                .addOption('right', t('settings.handleSide.right'))
                .setValue(this.plugin.settings.handleSide)
                .onChange(async (value: 'left' | 'right') => {
                    this.plugin.settings.handleSide = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName(t('settings.handleAlwaysVisible.name'))
            .setDesc(t('settings.handleAlwaysVisible.desc'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.handleAlwaysVisible)
                .onChange(async (value) => {
                    this.plugin.settings.handleAlwaysVisible = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName(t('settings.foldHandle.name'))
            .setDesc(t('settings.foldHandle.desc'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.foldHandle)
                .onChange(async (value) => {
                    this.plugin.settings.foldHandle = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName(localize('整块选择'))
            .setDesc(localize('鼠标跨块选择时扩展为完整块，输入和退格也作用于整块；不改变 Shift＋方向键的精确选择。'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.snapSelectionToBlocks)
                .onChange(async (value) => {
                    this.plugin.settings.snapSelectionToBlocks = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName(localize('块级快捷键'))
            .setDesc(localize('⌘A 先选当前块，再选全文；块首退格依次退缩进、移除列表或标题标记，再合并上块。'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.blockKeys)
                .onChange(async (value) => {
                    this.plugin.settings.blockKeys = value;
                    await this.plugin.saveSettings();
                }));

    }

    private renderInsert(containerEl: HTMLElement): void {
        new Setting(containerEl).setName(localize('触发')).setHeading();

        new Setting(containerEl)
            .setName(localize('加号按钮'))
            .setDesc(localize('在块拖动手柄旁显示插入按钮。'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.plusHandle)
                .onChange(async (value) => {
                    this.plugin.settings.plusHandle = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName(localize('输入触发'))
            .setDesc(localize('输入触发字符打开插入菜单，继续输入可筛选项目。'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.slashMenu)
                .onChange(async (value) => {
                    this.plugin.settings.slashMenu = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName(localize('触发字符'))
            .setDesc(localize('单个字符。设为 / 时兼容中文输入法的「、」；组合键可在 Obsidian 快捷键中设置。'))
            .addText(text => text
                .setPlaceholder('/')
                .setValue(this.plugin.settings.slashTrigger)
                .onChange(async (value) => {
                    this.plugin.settings.slashTrigger = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName(localize('行内触发'))
            .setDesc(localize('允许在行内空格后触发；关闭后只在空块触发。不改变网址、日期和单词中的斜杠。'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.slashInline)
                .onChange(async (value) => {
                    this.plugin.settings.slashInline = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName(localize('嵌入附件'))
            .setDesc(localize('关闭时插入链接；开启时直接显示附件内容。保存位置仍由「文件与链接」设置决定。'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.embedAttachments)
                .onChange(async (value) => {
                    this.plugin.settings.embedAttachments = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName(t('settings.insertItems.name'))
            .setDesc(t('settings.insertItems.desc'))
            .setHeading();

        this.renderInsertItemList(containerEl);
    }

    private renderAdvanced(containerEl: HTMLElement): void {
        new Setting(containerEl).setName(localize('格式')).setHeading();
        for (const [key, name, placeholder] of [['dateFormat', localize('日期格式'), 'YYYY-MM-DD'], ['timeFormat', localize('时间格式'), 'HH:mm']] as const) {
            new Setting(containerEl).setName(name).setDesc(localize`用于插入${key === 'dateFormat' ? localize('日期') : localize('时间')}。`)
                .addText(text => text.setPlaceholder(placeholder).setValue(this.plugin.settings[key]).onChange(async value => {
                    this.plugin.settings[key] = value; await this.plugin.saveSettings();
                }));
        }
        new Setting(containerEl).setName(localize('兼容')).setHeading();
        for (const [name, description] of [
            ['Iconic', localize('启用时自动让出图标控制权，Keyline 的自定义图标数据保留。')],
            ['Make.md', localize('原生文件树单独识别；选择工具条关闭后，恢复 Make.md 的工具条。')],
            ['Bucket', localize('分组、路径与排序仍由 Bucket 管理；Keyline 只提供配套样式。')],
            [localize('数据安全'), localize('排版与界面设置不改写笔记。菜单操作、工作区保存继续使用原有功能。')],
        ]) new Setting(containerEl).setName(name).setDesc(description);
    }

    private renderThemeLayoutPanel(): void {
        const panelEl = this.themeLayoutPanelEl;
        if (!panelEl) return;
        panelEl.empty();

        new Setting(panelEl)
            .setName(localize('即时生效'))
            .setDesc(localize('参数自动保存；无需 Style Settings。'))
            .setHeading()
            .addButton(button => button
                .setButtonText(localize('恢复排版默认'))
                .setTooltip(localize('只重置本面板的排版参数'))
                .onClick(async () => {
                    this.plugin.settings.themeLayout = { ...DEFAULT_THEME_LAYOUT_SETTINGS };
                    await this.plugin.saveThemeLayoutSettingsNow();
                    this.renderThemeLayoutPanel();
                }));

        const previewEl = panelEl.createEl('details', {
            cls: 'ncl-theme-layout-preview',
        });
        previewEl.createEl('summary', { cls: 'ncl-theme-layout-preview-label', text: localize('预览') });
        const previewViewportEl = previewEl.createDiv({ cls: 'ncl-theme-layout-preview-canvas' });
        const previewCanvasEl = previewViewportEl.createDiv({ cls: 'ncl-theme-layout-preview-content' });
        previewCanvasEl.createDiv({ cls: 'ncl-theme-layout-preview-mode', text: localize('编辑视图') });
        previewCanvasEl.createDiv({ cls: 'ncl-theme-layout-preview-heading', text: localize('示例标题') });
        const paragraphEl = previewCanvasEl.createEl('p');
        paragraphEl.appendText(localize('这是正文第一行，用来观察行高、段距和首行缩进。'));
        paragraphEl.createEl('br');
        paragraphEl.appendText(localize('第二行会随着编辑视图行高一起变化。'));
        previewCanvasEl.createEl('p', { text: localize('这是第二个段落，用来分辨段前距与段后距。') });
        const listEl = previewCanvasEl.createEl('ul', { cls: 'ncl-theme-layout-preview-list' });
        const firstListItem = listEl.createEl('li', { text: localize('列表圆点与正文间距') });
        const nestedListEl = firstListItem.createEl('ul');
        nestedListEl.createEl('li', { text: localize('第二层缩进宽度') });
        const quoteEl = previewCanvasEl.createEl('blockquote');
        quoteEl.createDiv({ text: localize('引用第一行') });
        quoteEl.createDiv({ text: localize('引用第二行与上一行保持对齐') });
        const readingSampleEl = previewCanvasEl.createDiv({ cls: 'ncl-theme-layout-reading-sample' });
        readingSampleEl.createDiv({ cls: 'ncl-theme-layout-preview-mode', text: localize('阅读视图行高') });
        const readingParagraphEl = readingSampleEl.createEl('p');
        readingParagraphEl.appendText(localize('阅读视图第一行。'));
        readingParagraphEl.createEl('br');
        readingParagraphEl.appendText(localize('阅读视图第二行。'));

        panelEl.createEl('h3', { cls: 'ncl-theme-layout-section', text: localize('页面') });
        this.addThemeLayoutSlider(
            panelEl,
            'textMaxWidth',
            localize('正文最大宽度'),
            localize('限制编辑与阅读视图的最大宽度；需开启「缩减栏宽」。窄窗口自动收拢。')
        );
        this.addThemeLayoutSlider(
            panelEl,
            'pageSidePadding',
            localize('左右留白'),
            localize('最左端为自动留白；手动值在窄窗口中不超过每侧 20%。')
        );
        panelEl.createEl('h3', { cls: 'ncl-theme-layout-section', text: localize('正文') });
        this.addThemeLayoutSlider(
            panelEl,
            'editorLineHeight',
            localize('编辑视图行高'),
            localize('控制 Live Preview / Source mode 正文行高。')
        );
        this.addThemeLayoutSlider(
            panelEl,
            'readingLineHeight',
            localize('阅读视图行高'),
            localize('控制 Reading View 正文行高。')
        );
        this.addThemeLayoutSlider(
            panelEl,
            'paragraphGap',
            localize('正文换行／段落间距'),
            localize('控制相邻普通正文源行（按 Enter 换行）之间的留白；切换为标题、列表或引用等新块时，由该块的段前／段后距接管。')
        );
        this.addThemeLayoutSlider(
            panelEl,
            'paragraphBefore',
            localize('段前距'),
            localize('控制普通正文及 Quote 等独立文本块上方的留白；与上一块的段后距相遇时按较大值折叠，不会叠成一个空行。')
        );
        this.addThemeLayoutSlider(
            panelEl,
            'paragraphAfter',
            localize('段后距'),
            localize('控制普通正文及 Quote 等独立文本块下方的留白；与下一块的段前距相遇时按较大值折叠，不会重复累加。')
        );
        this.addThemeLayoutSlider(
            panelEl,
            'firstLineIndent',
            localize('首行缩进'),
            localize('仅用于普通正文段落，不缩进标题、列表、引用或代码块。')
        );
        panelEl.createEl('h3', { cls: 'ncl-theme-layout-section', text: localize('列表') });
        this.addThemeLayoutSlider(
            panelEl,
            'listLineHeight',
            localize('列表行高'),
            localize('控制列表文字本身的行高；一项文字换行时尤其明显。')
        );
        this.addThemeLayoutSlider(
            panelEl,
            'listItemSpacing',
            localize('列表项间距'),
            localize('控制两个独立的圆点、数字或 Todo 项目之间额外增加的垂直留白。')
        );
        this.addThemeLayoutSlider(
            panelEl,
            'listIndent',
            localize('列表层级缩进'),
            localize('第一层会随之小幅移动，第二层起使用完整数值；适用于有序、无序及任务列表。')
        );
        this.addThemeLayoutSlider(
            panelEl,
            'listMarkerGap',
            localize('列表符号与正文间距'),
            localize('控制 Live Preview、Reading View 和设置预览中圆点、数字或 Todo 复选框与正文的留白。编辑视图只改变真实 Markdown 分隔空格的字宽，不替换符号或光标。')
        );
        this.addThemeLayoutSlider(
            panelEl,
            'listBulletSize',
            localize('无序列表圆点大小'),
            localize('控制无序列表实心圆点的直径。')
        );
        panelEl.createEl('h3', { cls: 'ncl-theme-layout-section', text: localize('引用与标题') });
        this.addThemeLayoutSlider(
            panelEl,
            'blockquoteIndent',
            localize('引用缩进'),
            localize('控制引用线与正文之间的水平留白；Figma 原稿为 16px。')
        );
        this.addThemeLayoutSlider(
            panelEl,
            'headingBefore',
            localize('标题段前距'),
            localize('控制各级标题上方的呼吸空间。')
        );
        this.addThemeLayoutSlider(
            panelEl,
            'headingAfter',
            localize('标题段后距'),
            localize('控制标题与下一段正文之间的距离。')
        );
        this.groupRows(panelEl);
    }

    private addThemeLayoutSlider(
        containerEl: HTMLElement,
        key: ThemeLayoutSettingKey,
        name: string,
        description: string
    ): void {
        const spec = THEME_LAYOUT_SETTING_SPECS[key];
        new Setting(containerEl)
            .setName(name)
            .setDesc(description)
            .addSlider(slider => {
                slider
                    .setLimits(spec.min, spec.max, spec.step)
                    .setValue(this.plugin.settings.themeLayout[key])
                    .setInstant(true)
                    .onChange((value) => {
                        this.plugin.settings.themeLayout = normalizeThemeLayoutSettings({
                            ...this.plugin.settings.themeLayout,
                            [key]: value,
                        });
                        slider.sliderEl.setAttribute('aria-valuetext', formatThemeLayoutValue(key, this.plugin.settings.themeLayout[key]));
                        this.plugin.queueThemeLayoutSettingsSave();
                    });
                slider.sliderEl.setAttribute('aria-label', name);
                slider.sliderEl.setAttribute('aria-valuetext', formatThemeLayoutValue(key, this.plugin.settings.themeLayout[key]));

                // Keep the value visible even when hover descriptions are off.
                const displayCapable = slider as unknown as {
                    setDisplayFormat?: (format: (value: number) => string) => unknown;
                };
                if (typeof displayCapable.setDisplayFormat === 'function') {
                    displayCapable.setDisplayFormat((value) => formatThemeLayoutValue(key, value));
                } else {
                    const valueEl = containerEl.ownerDocument.createElement('span');
                    valueEl.className = 'ncl-setting-value';
                    const updateValue = () => { valueEl.textContent = formatThemeLayoutValue(key, Number(slider.sliderEl.value)); };
                    slider.sliderEl.before(valueEl); updateValue();
                    slider.sliderEl.addEventListener('input', updateValue);
                }
            });
    }

    /**
     * The insert menu's rows, reorderable and individually switchable.
     *
     * Order is stored as a full id list rather than as a sparse set of moves:
     * resolveMenuItems appends anything the list does not name, so a partial
     * list still works, but writing the whole list keeps what is stored and
     * what is shown identical.
     */
    private renderInsertItemList(containerEl: HTMLElement): void {
        this.insertListEl = containerEl.createDiv({ cls: 'ftn-insert-item-list' });
        this.refreshInsertList();

        new Setting(containerEl)
            .addButton((button) => button
                .setButtonText(t('settings.addCommand'))
                .onClick(() => {
                    new InsertCommandModal(this.app, null, (item: CustomInsertItem) => {
                        void this.applyLayout(addCustomItem(this.plugin.settings, item));
                    }).open();
                }))
            .addButton((button) => button
                .setButtonText(t('settings.resetOrder'))
                .onClick(() => {
                    void this.applyLayout(resetItemLayout(this.plugin.settings));
                }));
    }

    /**
     * Writes a layout back and repaints the list.
     *
     * Never calls display(). PluginSettingTab.display() begins by emptying the
     * whole tab, so using it to reflect a one-row change threw away every other
     * setting on the page and scrolled the user back to the top — on every add,
     * edit, delete, reorder and reset. Only the list needs to change, so only
     * the list is rebuilt.
     */
    private async applyLayout(next: InsertLayout): Promise<void> {
        this.plugin.settings.insertOrder = next.insertOrder;
        this.plugin.settings.insertHidden = next.insertHidden;
        this.plugin.settings.insertCustom = next.insertCustom;
        await this.plugin.saveSettings();
        this.refreshInsertList();
    }

    /** Every Obsidian command by id, for naming a custom row's binding. */
    private commandsById(): Record<string, { name?: string }> {
        return (this.app as unknown as {
            commands?: { commands?: Record<string, { name?: string }> };
        }).commands?.commands ?? {};
    }

    private refreshInsertList(): void {
        const listEl = this.insertListEl;
        if (!listEl) return;

        const settings = this.plugin.settings;
        // The list has its own max-height and scrolls independently, so a
        // repaint has to put it back where the user left it.
        const scrollTop = listEl.scrollTop;
        listEl.empty();

        // Hidden items must appear in this list or they could never be turned
        // back on, so it is resolved with an empty hidden set.
        const items = resolveMenuItems(BUILTIN_ITEMS, settings.insertCustom, settings.insertOrder, [], (key) => t(key));
        const order = items.map((item) => item.id);
        const commands = this.commandsById();

        items.forEach((item, index) => {
            const row = listEl.createDiv({ cls: 'ftn-insert-item-row', attr: { draggable: 'true' } });
            row.dataset.index = String(index);

            setIcon(row.createSpan({ cls: 'ftn-insert-item-grip' }), 'grip-vertical');
            setIcon(row.createSpan({ cls: 'ftn-insert-item-icon' }), item.icon);

            const custom = settings.insertCustom.find((entry) => entry.id === item.id);
            const textEl = row.createDiv({ cls: 'ftn-insert-item-text' });
            textEl.createDiv({ cls: 'ftn-insert-item-label', text: item.label });

            if (custom) {
                // Naming the bound command under the label is what makes a list
                // of custom rows readable: the label is the user's own wording,
                // so without this there is nothing on screen saying what the row
                // actually runs.
                const bound = commands[custom.commandId];
                if (bound) {
                    textEl.createDiv({
                        cls: 'ftn-insert-item-source',
                        text: t('settings.customCommand.boundTo').replace('{name}', bound.name ?? custom.commandId),
                    });
                } else {
                    // A binding whose command has gone (plugin disabled or
                    // removed) stays in the list and says so, rather than
                    // disappearing and taking the user's configuration with it.
                    textEl.createDiv({ cls: 'ftn-insert-item-source is-missing', text: t('settings.commandMissing') });
                }
            }

            const controls = row.createDiv({ cls: 'ftn-insert-item-controls' });

            const toggle = controls.createEl('input', { attr: { type: 'checkbox' } });
            toggle.checked = !settings.insertHidden.includes(item.id);
            // No repaint: the row's own shape does not change, and rebuilding
            // the list under the pointer would fight the click that got here.
            toggle.addEventListener('change', () => {
                const next = setItemHidden(this.plugin.settings, item.id, !toggle.checked);
                this.plugin.settings.insertHidden = next.insertHidden;
                void this.plugin.saveSettings();
            });

            if (custom) {
                const editBtn = controls.createDiv({ cls: 'ftn-insert-item-button', attr: { 'aria-label': t('settings.customCommand.edit') } });
                setIcon(editBtn, 'pencil');
                editBtn.addEventListener('click', () => {
                    new InsertCommandModal(this.app, custom, (updated) => {
                        void this.applyLayout(updateCustomItem(this.plugin.settings, updated));
                    }).open();
                });

                const deleteBtn = controls.createDiv({ cls: 'ftn-insert-item-button is-danger', attr: { 'aria-label': t('settings.customCommand.delete') } });
                setIcon(deleteBtn, 'trash-2');
                deleteBtn.addEventListener('click', () => {
                    void this.applyLayout(removeCustomItem(this.plugin.settings, custom.id));
                });
            }

            row.addEventListener('dragstart', (event) => {
                event.dataTransfer?.setData('text/plain', String(index));
                row.addClass('is-dragging');
            });
            row.addEventListener('dragend', () => row.removeClass('is-dragging'));
            row.addEventListener('dragover', (event) => {
                event.preventDefault();
                row.addClass('is-drop-target');
            });
            row.addEventListener('dragleave', () => row.removeClass('is-drop-target'));
            row.addEventListener('drop', (event) => {
                event.preventDefault();
                row.removeClass('is-drop-target');
                const from = Number(event.dataTransfer?.getData('text/plain'));
                if (from === index) return;
                // applyOrder drops ids the layout no longer has: `order` was
                // captured when this row was drawn, and the list no longer
                // re-renders the whole tab, so a row deleted since would
                // otherwise be written back as a phantom entry.
                void this.applyLayout(applyOrder(this.plugin.settings, reorderIds(order, from, index)));
            });
        });

        listEl.scrollTop = scrollTop;
    }
}
