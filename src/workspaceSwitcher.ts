import { localize } from './locale/ui';
import { App, Modal, Notice, setIcon } from 'obsidian';
import { FloatingSurfaceCoordinator } from './surfaceCoordinator';
import { WorkspaceMenu, WorkspaceMenuEntry } from './workspaceMenu';
import { RecoveryStore, WorkspaceCore, WorkspaceLayouts, hasWorkspace, alternatingRecoveryStore, workspaceSlot } from './workspaceLayouts';

type CoreHost = App & {
    internalPlugins?: { getPluginById?(id: string): { enabled?: boolean; _loaded?: boolean; instance?: WorkspaceCore & { plugin?: { _loaded?: boolean } } } };
    plugins?: { enabledPlugins?: Set<string> };
};

export function coreWorkspaces(app: App): WorkspaceCore | null {
    const entry = (app as CoreHost).internalPlugins?.getPluginById?.('workspaces');
    const core = entry?.instance;
    if (!core || entry?.enabled === false || entry?._loaded === false || core.plugin?._loaded === false ||
        !core.workspaces || typeof core.workspaces !== 'object' || Array.isArray(core.workspaces) || typeof core.saveData !== 'function') return null;
    return core;
}

/** Kept outside data.json so editor/appearance saves cannot overwrite recovery.
 * Two alternating slots ensure an interrupted write preserves the previous one. */
export function workspaceRecoveryStore(app: App, directory: string): RecoveryStore {
    return alternatingRecoveryStore(app.vault.adapter, directory);
}

class WorkspaceNameModal extends Modal {
    constructor(app: App, private save: (name: string) => Promise<void>) { super(app); }
    onOpen(): void {
        this.titleEl.textContent = localize('另存为新布局');
        this.modalEl.classList.add('ncl-workspace-name-modal');
        const doc = this.contentEl.ownerDocument, form = doc.createElement('form');
        const input = doc.createElement('input');
        input.type = 'text'; input.placeholder = localize('例如：阅读、写作'); input.setAttribute('aria-label', localize('布局名称'));
        const error = doc.createElement('p'); error.className = 'ncl-workspace-error'; error.setAttribute('role', 'alert'); error.hidden = true;
        const actions = doc.createElement('div'); actions.className = 'ncl-workspace-dialog-actions';
        const cancel = doc.createElement('button'); cancel.type = 'button'; cancel.textContent = localize('取消'); cancel.onclick = () => this.close();
        const submit = doc.createElement('button'); submit.type = 'submit'; submit.textContent = localize('保存'); submit.className = 'mod-cta';
        let pending = false;
        form.onsubmit = async e => {
            e.preventDefault(); if (pending) return; pending = true;
            submit.disabled = input.disabled = cancel.disabled = true; error.hidden = true;
            try { await this.save(input.value); this.close(); }
            catch (cause) { error.textContent = errorMessage(cause); error.hidden = false; }
            finally { pending = false; submit.disabled = input.disabled = cancel.disabled = false; if (input.isConnected) input.focus(); }
        };
        actions.append(cancel, submit); form.append(input, error, actions); this.contentEl.replaceChildren(form);
        doc.defaultView?.setTimeout(() => { if (input.isConnected) input.focus(); }, 0);
    }
    onClose(): void { this.contentEl.replaceChildren(); }
}

const errorMessage = (cause: unknown): string => cause instanceof Error ? cause.message : localize('布局操作未完成，请重试。');

export class WorkspaceSwitcher {
    readonly layouts: WorkspaceLayouts;
    private item: HTMLElement | null = null;
    private button: HTMLButtonElement | null = null;
    private label: HTMLElement | null = null;
    private bar: HTMLElement | null = null;
    private menu: WorkspaceMenu | null = null;
    private modal: WorkspaceNameModal | null = null;
    private observer: MutationObserver | null = null;
    private resize: ResizeObserver | null = null;
    private observed = new Set<Element>();
    private frame: number | null = null;
    private active = false;
    private get win(): Window & typeof globalThis { return this.doc.defaultView as Window & typeof globalThis; }
    constructor(
        private app: App, private doc: Document, store: RecoveryStore,
        private coordinator: FloatingSurfaceCoordinator, private enabled: () => boolean,
        private createItem: () => HTMLElement
    ) {
        this.layouts = new WorkspaceLayouts({
            core: () => coreWorkspaces(app),
            conflict: () => ['workspaces-plus', 'workspace-plus-plus'].some(id => (app as CoreHost).plugins?.enabledPlugins?.has(id)),
            getLayout: () => app.workspace.getLayout(),
            changeLayout: layout => app.workspace.changeLayout(layout),
        }, store);
    }
    start(): void {
        if (this.active) return;
        this.active = true;
        this.observer = new this.win.MutationObserver(records => {
            if (records.some(r => {
                if (this.item?.contains(r.target) || r.target === this.item) return false;
                const parent = r.target instanceof this.win.Element ? r.target : r.target.parentElement;
                return parent?.closest('.status-bar') || [...Array.from(r.addedNodes), ...Array.from(r.removedNodes)]
                    .some(n => n instanceof this.win.Element && (n.matches('.status-bar') || n.querySelector('.status-bar')));
            })) this.schedule();
        });
        this.observer.observe(this.doc.body, { childList: true, subtree: true, characterData: true });
        this.resize = new this.win.ResizeObserver(this.schedule);
        this.win.addEventListener('resize', this.schedule);
        this.win.addEventListener('focus', this.schedule);
        this.refresh();
    }
    private schedule = (): void => {
        if (!this.active || this.frame !== null) return;
        this.frame = this.win.requestAnimationFrame(() => { this.frame = null; this.refresh(); });
    };
    private release(): void {
        this.menu?.close(false); this.menu = null;
        this.resize?.disconnect();
        this.observed.clear();
        this.bar?.classList.remove('ncl-workspace-bar'); this.bar = null;
        this.item?.remove(); this.item = null; this.button = null; this.label = null;
    }
    stop(): void {
        this.active = false; this.layouts.stop();
        this.observer?.disconnect(); this.observer = null;
        this.resize?.disconnect(); this.resize = null;
        this.win.removeEventListener('resize', this.schedule);
        this.win.removeEventListener('focus', this.schedule);
        if (this.frame !== null) this.win.cancelAnimationFrame(this.frame);
        this.frame = null; this.modal?.close(); this.modal = null; this.release();
    }
    refresh(): void {
        if (!this.active) return;
        const visible = this.enabled() && !this.doc.body.classList.contains('is-mobile') &&
            this.win.getComputedStyle(this.doc.body).getPropertyValue('--ncl-workspace-controls').trim() === '1';
        const bar = this.doc.querySelector<HTMLElement>('.app-container > .status-bar');
        if (!visible || !bar) { this.release(); return; }
        if (this.bar !== bar || !this.item?.isConnected) {
            this.release(); this.bar = bar;
            this.item = this.createItem(); this.item.classList.add('ncl-workspace-switcher');
            this.button = this.doc.createElement('button'); this.button.type = 'button';
            this.button.className = 'ncl-workspace-button'; this.button.setAttribute('aria-haspopup', 'menu');
            this.button.setAttribute('aria-expanded', 'false');
            const icon = this.doc.createElement('span'); icon.setAttribute('aria-hidden', 'true'); setIcon(icon, 'panels-top-left');
            this.label = this.doc.createElement('span'); this.label.className = 'ncl-workspace-label';
            const arrow = this.doc.createElement('span'); arrow.className = 'ncl-workspace-arrow'; arrow.setAttribute('aria-hidden', 'true'); setIcon(arrow, 'chevron-up');
            this.button.append(icon, this.label, arrow); this.item.append(this.button);
            this.button.onclick = () => this.menu ? this.menu.close() : this.openMenu();
            this.button.onkeydown = e => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); this.openMenu(); } };
            bar.classList.add('ncl-workspace-bar');
        }
        const core = coreWorkspaces(this.app);
        const name = core?.activeWorkspace && hasWorkspace(core, core.activeWorkspace) ? core.activeWorkspace : localize('布局');
        if (this.label!.textContent !== name) this.label!.textContent = name;
        const aria = localize`切换工作区布局：${name}`;
        if (this.button!.getAttribute('aria-label') !== aria) this.button!.setAttribute('aria-label', aria);
        this.button!.disabled = this.layouts.busy;
        this.position();
        this.menu?.reposition();
    }
    private position(): void {
        const bar = this.bar!, item = this.item!, bounds = bar.getBoundingClientRect();
        let left = 0, right = bounds.width, top: number | null = null, wrapped = false;
        const observed = new Set<Element>([bar]);
        for (const sibling of Array.from(bar.children)) {
            if (sibling === item || !(sibling instanceof this.win.HTMLElement)) continue;
            observed.add(sibling);
            const r = sibling.getBoundingClientRect();
            if (!r.width || !r.height || this.win.getComputedStyle(sibling).display === 'none') continue;
            if (top === null) top = r.top;
            if (Math.abs(r.top - top) > 3) wrapped = true;
            if (sibling.matches('.syncstatusbar')) left = Math.max(left, r.right - bounds.left);
            else right = Math.min(right, r.left - bounds.left);
        }
        for (const node of this.observed) if (!observed.has(node)) this.resize?.unobserve(node);
        for (const node of observed) if (!this.observed.has(node)) this.resize?.observe(node);
        this.observed = observed;
        const slot = workspaceSlot(bounds.width, left, right, wrapped);
        for (const [cls, state] of [['is-separate-row', slot.separateRow], ['is-icon-only', slot.iconOnly]] as const) {
            if (item.classList.contains(cls) !== state) item.classList.toggle(cls, state);
        }
        const value = `${slot.width}px`;
        if (item.style.getPropertyValue('--ncl-workspace-width') !== value) item.style.setProperty('--ncl-workspace-width', value);
    }
    private async run(action: () => Promise<void>, success?: string): Promise<void> {
        try {
            const promise = action(); this.refresh();
            await promise; if (success) new Notice(success);
        } catch (cause) { new Notice(errorMessage(cause)); }
        finally { this.refresh(); }
    }
    saveCurrent(): void {
        let core: WorkspaceCore;
        try { core = this.layouts.core(); } catch (cause) { new Notice(errorMessage(cause)); return; }
        if (!core.activeWorkspace || !hasWorkspace(core, core.activeWorkspace)) { this.saveAs(); return; }
        void this.run(() => this.layouts.save(core.activeWorkspace, true), localize('当前布局已保存'));
    }
    saveAs(): void {
        try { this.layouts.core(); } catch (cause) { new Notice(errorMessage(cause)); return; }
        this.modal?.close();
        this.modal = new WorkspaceNameModal(this.app, async name => {
            await this.layouts.save(name, false); this.refresh(); new Notice(localize('新布局已保存'));
        });
        this.modal.open();
    }
    restore(): void { void this.run(() => this.layouts.restore(), localize('已恢复切换前的布局')); }
    manage(): void {
        void this.run(async () => {
            // The native manager can also load a layout, so protect the current
            // scene before handing control to it. Its own save/delete UI stays native.
            const core = await this.layouts.prepareManagement();
            core.onOpenModal?.();
        });
    }
    openMenu(): void {
        if (this.layouts.busy) return;
        this.menu?.close(false);
        this.refresh();
        const entries: WorkspaceMenuEntry[] = [];
        let core: WorkspaceCore | null = null;
        try { core = this.layouts.core(); } catch (cause) {
            entries.push({ title: errorMessage(cause), icon: 'info', action: () => new Notice(errorMessage(cause)) });
        }
        if (core) {
            const current = core;
            for (const name of Object.keys(current.workspaces)) {
                entries.push({ title: name, checked: name === current.activeWorkspace,
                    action: () => { void this.run(() => this.layouts.switchTo(name)); } });
            }
            if (Object.keys(current.workspaces).length) entries.push({ separator: true });
            entries.push({ title: localize('保存当前布局'), icon: 'save', action: () => this.saveCurrent() });
            entries.push({ title: localize('另存为新布局…'), icon: 'plus', action: () => this.saveAs() });
            entries.push({ title: localize('恢复切换前布局'), icon: 'undo-2', action: () => this.restore() });
            if (typeof current.onOpenModal === 'function') {
                entries.push({ title: localize('原生工作区管理…'), icon: 'settings', action: () => this.manage() });
            }
        }
        const menu = new WorkspaceMenu(this.doc, this.button, this.coordinator, () => { if (this.menu === menu) this.menu = null; });
        this.menu = menu; menu.open(entries);
    }
}
