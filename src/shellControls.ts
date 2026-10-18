import { localize } from './locale/ui';
import { setIcon } from 'obsidian';
import { StatusBarPresentation } from './statusBarPresentation';

/** A reversible presentation of the SAME native vault profile. Reusing its
 * nodes preserves native vault menus, help/settings actions and menu anchors;
 * no Electron IPC, copied vault list, synthetic status or persistent settings. */
export class ShellControls {
    private active = false;
    private frame: number | null = null;
    private observer: MutationObserver | null = null;
    private resize: ResizeObserver | null = null;
    private profile: HTMLElement | null = null;
    private space: HTMLElement | null = null;
    private workspace: HTMLElement | null = null;
    private ribbon: HTMLElement | null = null;
    private dock: HTMLElement | null = null;
    private glyph: HTMLElement | null = null;
    private restore: Array<() => void> = [];
    private get win(): Window & typeof globalThis { return this.doc.defaultView as Window & typeof globalThis; }

    private status: StatusBarPresentation;
    constructor(private doc: Document) { this.status = new StatusBarPresentation(doc); }

    start(): void {
        if (this.active) return;
        this.active = true;
        this.observer = new this.win.MutationObserver(records => {
            // Ignore editor content and icon enhancers. Only shell visibility
            // or replacement of a native shell node requires rediscovery.
            const shell = '.workspace, .workspace-ribbon.mod-left, .mod-left-split, .workspace-sidedock-vault-profile';
            if (records.some(record => record.type === 'attributes'
                ? [this.doc.body, this.workspace, this.dock, this.ribbon].includes(record.target as HTMLElement)
                : [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)].some(node =>
                    node instanceof this.win.Element && (node.matches(shell) || node.querySelector(shell))))) this.schedule();
        });
        // Layout/CSS changes are also requested by the plugin.
        this.observer.observe(this.doc.body, { subtree: true, childList: true,
            attributes: true, attributeFilter: ['class'] });
        this.resize = new this.win.ResizeObserver(this.schedule);
        this.win.addEventListener('resize', this.schedule);
        this.refresh();
    }

    stop(): void {
        this.active = false;
        if (this.frame !== null) this.win.cancelAnimationFrame(this.frame);
        this.frame = null;
        this.observer?.disconnect(); this.observer = null;
        this.resize?.disconnect(); this.resize = null;
        this.win.removeEventListener('resize', this.schedule);
        this.release();
        this.status.stop();
    }

    private schedule = (): void => {
        if (!this.active || this.frame !== null) return;
        this.frame = this.win.requestAnimationFrame(() => { this.frame = null; this.refresh(); });
    };

    private attribute(el: HTMLElement, name: string, value: string | null): void {
        const before = el.getAttribute(name);
        if (value === null) el.removeAttribute(name); else el.setAttribute(name, value);
        this.restore.push(() => before === null ? el.removeAttribute(name) : el.setAttribute(name, before));
    }

    private accessible(el: HTMLElement, label: string): void {
        this.attribute(el, 'aria-label', label);
        // aria-label already drives Obsidian's tooltip. A title adds a SECOND
        // browser tooltip, especially visible on older Electron builds.
        this.attribute(el, 'title', null);
        this.attribute(el, 'data-tooltip-position', 'top');
        if (el.tagName === 'BUTTON') return;
        this.attribute(el, 'role', 'button');
        this.attribute(el, 'tabindex', '0');
        const key = (event: KeyboardEvent) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            // Native menu uses forEvent(clientX/clientY). HTMLElement.click()
            // would anchor keyboard-opened menus at the screen's top-left.
            const r = el.getBoundingClientRect();
            el.dispatchEvent(new this.win.MouseEvent('click', {
                bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2,
            }));
        };
        el.addEventListener('keydown', key);
        this.restore.push(() => el.removeEventListener('keydown', key));
    }

    private release(): void {
        this.resize?.disconnect();
        for (const restore of this.restore.reverse()) restore();
        this.restore = [];
        this.glyph?.remove(); this.glyph = null;
        if (this.profile) {
            // If core replaced the dock, the placeholder is detached and its
            // old profile is now an orphan, not a node to resurrect in a new UI.
            if (this.space?.isConnected) this.space.replaceWith(this.profile);
            else this.profile.remove();
        }
        this.space?.remove(); this.space = null; this.profile = null;
        this.workspace?.classList.remove('ncl-shell-managed');
        this.ribbon?.classList.remove('ncl-shell-ribbon');
        this.ribbon?.style.removeProperty('--ncl-shell-footer-height');
        this.workspace = this.ribbon = this.dock = null;
    }

    refresh(): void {
        if (!this.active) return;
        const enabled = !this.doc.body.classList.contains('is-mobile') &&
            this.win.getComputedStyle(this.doc.body).getPropertyValue('--ncl-shell-controls').trim() === '1';
        if (enabled) this.status.start(); else this.status.stop();
        const workspace = this.doc.querySelector<HTMLElement>('.workspace');
        const dock = workspace?.querySelector<HTMLElement>(':scope > .mod-left-split');
        const ribbon = workspace?.querySelector<HTMLElement>(':scope > .workspace-ribbon.mod-left');
        if (!enabled || !workspace || !dock || !ribbon) { this.release(); return; }
        const candidate = dock.querySelector<HTMLElement>('.workspace-sidedock-vault-profile');
        if (this.profile && (!this.profile.isConnected || !this.space?.isConnected ||
            workspace !== this.workspace || dock !== this.dock || ribbon !== this.ribbon || candidate)) this.release();
        if (!this.profile) {
            const profile = candidate ?? dock.querySelector<HTMLElement>('.workspace-sidedock-vault-profile');
            const switcher = profile?.querySelector<HTMLElement>('.workspace-drawer-vault-switcher');
            const settings = profile?.querySelector<SVGElement>('.workspace-drawer-vault-actions .lucide-settings')?.closest<HTMLElement>('.clickable-icon');
            // Fail closed on unknown future native markup. Never hide an entry
            // unless we have its real working counterpart in hand.
            if (!profile || !switcher || !settings) return;
            this.workspace = workspace; this.dock = dock; this.ribbon = ribbon; this.profile = profile;
            this.space = this.doc.createElement('div'); this.space.className = 'ncl-shell-footer-space';
            profile.before(this.space);
            this.attribute(profile, 'class', profile.className + ' ncl-shell-profile');
            this.attribute(profile, 'style', profile.getAttribute('style') ?? '');
            this.attribute(settings, 'class', settings.className + ' ncl-shell-settings');
            const help = Array.from(profile.querySelectorAll<HTMLElement>('.workspace-drawer-vault-actions .clickable-icon')).filter(el => el !== settings);
            for (const el of help) this.attribute(el, 'class', el.className + ' ncl-shell-secondary');
            this.accessible(switcher, localize`切换 Vault：${switcher.querySelector('.workspace-drawer-vault-name')?.textContent ?? ''}`);
            // Core installs a direct mouseover handler for the path/count card.
            // Expanded: the name is already visible, so suppress hover only.
            // Compact: core skips its hidden name node, leaving one aria-label
            // tooltip on the visible switcher. Click/contextmenu stay native.
            const quietHover = (event: MouseEvent) => {
                if (!profile.classList.contains('is-compact')) event.stopImmediatePropagation();
            };
            switcher.addEventListener('mouseover', quietHover, true);
            this.restore.push(() => switcher.removeEventListener('mouseover', quietHover, true));
            this.accessible(settings, localize('设置'));
            for (const el of help) this.accessible(el, localize('帮助'));
            this.glyph = this.doc.createElement('span'); this.glyph.className = 'ncl-shell-vault-icon';
            this.glyph.setAttribute('aria-hidden', 'true'); setIcon(this.glyph, 'vault'); switcher.prepend(this.glyph);
            workspace.append(profile);
            workspace.classList.add('ncl-shell-managed'); ribbon.classList.add('ncl-shell-ribbon');
            this.resize?.observe(workspace); this.resize?.observe(dock); this.resize?.observe(ribbon); this.resize?.observe(profile);
        }
        const open = workspace.classList.contains('is-left-sidedock-open');
        const wr = workspace.getBoundingClientRect(), dr = dock.getBoundingClientRect(), rr = ribbon.getBoundingClientRect();
        const ribbonVisible = rr.width > 0 && this.win.getComputedStyle(ribbon).display !== 'none';
        const profile = this.profile!;
        if (profile.classList.contains('is-compact') === open) profile.classList.toggle('is-compact', !open);
        // Hidden ribbon + hidden dock means the user chose no navigation. Keep
        // native menu-bar/hotkeys; don't invent a floating third navigation area.
        profile.style.display = !open && !ribbonVisible ? 'none' : '';
        const left = open ? (ribbonVisible ? rr.left : dr.left) + 8 : rr.left;
        const width = open ? dr.right - 8 - left : rr.width + 8;
        profile.style.left = `${left - wr.left}px`;
        profile.style.width = `${Math.max(0, width)}px`;
        const height = profile.getBoundingClientRect().height;
        this.space!.style.height = `${open ? height : 0}px`;
        ribbon.style.setProperty('--ncl-shell-footer-height', `${height}px`);
    }
}
