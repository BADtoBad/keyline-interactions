import { localize } from './locale/ui';
import { App, Modal, Notice, getIconIds } from 'obsidian';
import { ICON_COLORS, IconOverride, ResolvedFileIcon, normalizeIconOverride } from './fileIconModel';
import { paintIdentity } from './fileIconManager';
import { KEYLINE_IDENTITY_ASSETS } from './fileIconAssets';

const COLOR_LABELS = [localize('灰色'), localize('蓝色'), localize('红色'), localize('绿色'), localize('紫色'), localize('琥珀'), localize('青色'), localize('橙色'), localize('粉色')];
const SEARCH_WORDS: Record<string, string> = { '文件': 'file', '文档': 'file', '笔记': 'notebook', '图片': 'image', '音乐': 'music', '音频': 'audio', '视频': 'video', '文件夹': 'folder', '书': 'book', '星': 'star', '工作': 'briefcase', '日历': 'calendar', '代码': 'code', '收藏': 'bookmark', '项目': 'folder' };

/** Native modal: edits stay local until Save; closing/Escape is Cancel. */
export class FileIconModal extends Modal {
    private draft: IconOverride;
    private pending = false;
    private preview!: HTMLElement;
    private summary!: HTMLElement;
    private grid!: HTMLElement;
    private count!: HTMLElement;
    private colorSelect!: HTMLSelectElement;
    private customColor!: HTMLInputElement;
    private automatic!: HTMLButtonElement;
    private iconIds: string[];
    constructor(app: App, private options: {
        title: string; initial: IconOverride; base: ResolvedFileIcon; monochrome: boolean;
        save: (value: IconOverride) => Promise<void>;
    }) {
        super(app);
        this.draft = { ...options.initial };
        this.iconIds = [...Object.keys(KEYLINE_IDENTITY_ASSETS), ...Array.from(new Set(getIconIds().map(id => id.replace(/^lucide-/, '')))).sort()];
    }
    onOpen(): void {
        this.modalEl.classList.add('ncl-icon-modal');
        this.titleEl.textContent = localize('更改图标');
        const root = this.contentEl;
        root.replaceChildren();
        const caption = root.createEl('p', { cls: 'ncl-icon-caption', text: this.options.title });
        caption.title = this.options.title;
        const row = root.createDiv({ cls: 'ncl-icon-preview' });
        this.preview = row.createSpan();
        this.summary = row.createSpan();
        this.summary.setAttribute('aria-live', 'polite');
        this.automatic = root.createEl('button', { text: localize('图标跟随自动规则') });
        this.automatic.type = 'button';
        this.automatic.onclick = () => { delete this.draft.icon; this.updatePreview(); this.updateSelection(); };
        const search = root.createEl('input', { type: 'search', placeholder: localize('搜索图标：文件、日历、star…') });
        search.className = 'ncl-icon-search';
        search.setAttribute('aria-label', localize('搜索图标'));
        search.oninput = () => this.renderGrid(search.value);
        this.grid = root.createDiv({ cls: 'ncl-icon-grid' });
        this.grid.setAttribute('role', 'group');
        this.grid.setAttribute('aria-label', localize('可选图标'));
        this.count = root.createDiv({ cls: 'ncl-icon-caption' });
        this.count.setAttribute('aria-live', 'polite');
        this.renderGrid('');

        const colorRow = root.createEl('label', { cls: 'ncl-icon-color-row' });
        colorRow.createSpan({ text: localize('颜色') });
        this.colorSelect = colorRow.createEl('select');
        this.colorSelect.setAttribute('aria-label', localize('图标颜色'));
        this.colorSelect.createEl('option', { value: '', text: localize('跟随自动规则') });
        ICON_COLORS.forEach((color, i) => this.colorSelect.createEl('option', { value: color, text: COLOR_LABELS[i] }));
        this.colorSelect.createEl('option', { value: 'custom', text: localize('自定义颜色…') });
        this.customColor = root.createEl('input', { type: 'color' });
        this.customColor.setAttribute('aria-label', localize('自定义图标颜色'));
        this.customColor.value = this.draft.color?.startsWith('#') ? this.draft.color : '#527bb3';
        this.colorSelect.value = this.draft.color?.startsWith('#') ? 'custom' : this.draft.color ?? '';
        this.customColor.hidden = this.colorSelect.value !== 'custom';
        this.colorSelect.onchange = () => {
            const value = this.colorSelect.value;
            if (!value) delete this.draft.color;
            else this.draft.color = value === 'custom' ? this.customColor.value : value;
            this.customColor.hidden = value !== 'custom';
            this.updatePreview();
        };
        this.customColor.oninput = () => { this.draft.color = this.customColor.value; this.updatePreview(); };
        root.createEl('p', { cls: 'ncl-icon-caption', text: this.options.monochrome
            ? localize('当前使用单色模式。颜色选择会保存，关闭单色模式后生效。')
            : localize('预设颜色适配浅色与深色主题。自定义颜色请分别检查两种模式下的可读性。') });
        const actions = root.createDiv({ cls: 'ncl-icon-actions' });
        const reset = actions.createEl('button', { text: localize('恢复自动') });
        reset.onclick = () => {
            this.draft = {}; this.colorSelect.value = ''; this.customColor.hidden = true;
            this.updatePreview(); this.updateSelection();
        };
        const cancel = actions.createEl('button', { text: localize('取消') });
        cancel.onclick = () => this.close();
        const save = actions.createEl('button', { text: localize('保存'), cls: 'mod-cta' });
        save.onclick = async () => {
            if (this.pending) return;
            this.pending = true; save.disabled = true;
            try { await this.options.save(normalizeIconOverride(this.draft)); this.close(); }
            catch (error) { console.error('[Keyline] Icon settings save failed', error); new Notice(localize('图标设置未保存，请重试。')); }
            finally { this.pending = false; save.disabled = false; }
        };
        this.updatePreview();
        search.focus();
    }
    private updatePreview(): void {
        const value = { ...this.options.base, icon: this.draft.icon ?? this.options.base.icon,
            color: this.options.monochrome ? 'gray' : this.draft.color ?? this.options.base.color };
        paintIdentity(this.preview, value);
        this.summary.textContent = `${value.icon} · ${this.draft.icon ? localize('自定义图标') : localize('自动图标')} / ${this.draft.color ? localize('自定义颜色') : localize('自动颜色')}`;
        this.automatic.setAttribute('aria-pressed', String(!this.draft.icon));
    }
    private updateSelection(): void {
        for (const button of Array.from(this.grid.querySelectorAll<HTMLButtonElement>('button'))) {
            button.setAttribute('aria-pressed', String(button.dataset.icon === this.draft.icon));
        }
    }
    private renderGrid(query: string): void {
        const normalized = query.trim().toLowerCase();
        const term = SEARCH_WORDS[normalized] ?? normalized;
        const matches = this.iconIds.filter(id => id.includes(term));
        this.grid.replaceChildren();
        for (const icon of matches.slice(0, 64)) {
            const button = this.grid.createEl('button');
            button.type = 'button'; button.title = icon; button.dataset.icon = icon;
            button.setAttribute('aria-label', icon);
            button.tabIndex = this.grid.children.length === 1 ? 0 : -1;
            paintIdentity(button, { ...this.options.base, icon, color: 'gray' });
            button.onclick = () => {
                this.grid.querySelectorAll<HTMLButtonElement>('button').forEach(b => b.tabIndex = b === button ? 0 : -1);
                this.draft.icon = icon; this.updatePreview(); this.updateSelection();
            };
            button.onkeydown = event => {
                const buttons = Array.from(this.grid.querySelectorAll<HTMLButtonElement>('button'));
                const columns = Math.max(1, getComputedStyle(this.grid).gridTemplateColumns.split(/\s+/).length);
                const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowDown' ? columns : event.key === 'ArrowUp' ? -columns : 0;
                if (!step && event.key !== 'Home' && event.key !== 'End') return;
                event.preventDefault();
                const index = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : Math.min(buttons.length - 1, Math.max(0, buttons.indexOf(button) + step));
                buttons.forEach((b, i) => b.tabIndex = i === index ? 0 : -1);
                buttons[index]?.focus();
            };
        }
        this.count.textContent = matches.length ? localize`显示 ${Math.min(64, matches.length)} / ${matches.length} 个图标${matches.length > 64 ? localize('，可继续输入关键词缩小范围') : ''}` : localize('没有匹配的图标，请换个关键词。');
        this.updateSelection();
    }
    onClose(): void { this.contentEl.replaceChildren(); }
}
