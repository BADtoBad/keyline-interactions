import { localize } from './locale/ui';
import { setIcon } from 'obsidian';
import { FloatingSurfaceCoordinator, FloatingSurfaceLease } from './surfaceCoordinator';
import { workspaceMenuPosition } from './workspaceMenuPosition';

export type WorkspaceMenuEntry = { separator: true } | {
    title: string; icon?: string; checked?: boolean; action: () => void;
};
let sequence = 0;

/** An in-window Keyline menu, independent of Obsidian's native-menu preference. */
export class WorkspaceMenu {
    private root: HTMLElement | null = null;
    private rows: HTMLButtonElement[] = [];
    private lease: FloatingSurfaceLease | null = null;
    private get win(): Window & typeof window { return this.doc.defaultView as Window & typeof window; }
    constructor(private doc: Document, private anchor: HTMLButtonElement | null,
        private coordinator: FloatingSurfaceCoordinator, private onClose: () => void) {}

    open(entries: WorkspaceMenuEntry[]): void {
        const root = this.root = this.doc.createElement('div');
        root.className = 'ncl-workspace-menu'; root.id = `ncl-workspace-menu-${++sequence}`;
        root.setAttribute('role', 'menu'); root.setAttribute('aria-label', localize('工作区布局'));
        let initial = 0;
        for (const entry of entries) {
            if ('separator' in entry) {
                const separator = this.doc.createElement('div'); separator.className = 'ncl-workspace-menu-separator';
                separator.setAttribute('role', 'separator'); root.append(separator); continue;
            }
            const row = this.doc.createElement('button'); row.type = 'button'; row.tabIndex = -1;
            row.className = 'ncl-workspace-menu-item'; row.setAttribute('role', entry.checked === undefined ? 'menuitem' : 'menuitemradio');
            if (entry.checked !== undefined) row.setAttribute('aria-checked', String(entry.checked));
            if (entry.checked) initial = this.rows.length;
            const icon = this.doc.createElement('span'); icon.className = 'ncl-workspace-menu-icon'; icon.setAttribute('aria-hidden', 'true');
            if (entry.icon || entry.checked) setIcon(icon, entry.icon ?? 'check');
            const label = this.doc.createElement('span'); label.className = 'ncl-workspace-menu-title'; label.textContent = entry.title;
            row.append(icon, label); root.append(row); this.rows.push(row);
            row.onclick = () => { this.close(); entry.action(); };
            row.onpointermove = () => { if (this.doc.activeElement !== row) row.focus({ preventScroll: true }); };
        }
        root.addEventListener('keydown', this.keydown);
        this.lease = this.coordinator.claim(this.doc, 'action-menu', reason => this.close(reason === 'escape' || reason === 'viewport'), {
            dismissOnViewportChange: true,
            containsEventTarget: target => target instanceof this.win.Node && !!this.root?.contains(target),
        });
        this.doc.body.append(root); this.reposition();
        this.anchor?.setAttribute('aria-controls', root.id); this.anchor?.setAttribute('aria-expanded', 'true');
        this.doc.addEventListener('pointerdown', this.outside, true);
        this.win.addEventListener('blur', this.blur);
        this.rows[initial]?.focus({ preventScroll: true });
        this.rows[initial]?.scrollIntoView({ block: 'nearest' });
    }
    reposition(): void {
        if (!this.root) return;
        const win = this.win, app = this.doc.querySelector('.app-container')?.getBoundingClientRect();
        const anchor = this.anchor?.getBoundingClientRect();
        const bar = this.anchor?.closest('.status-bar')?.getBoundingClientRect();
        const placement = workspaceMenuPosition({
            left: Math.max(0, app?.left ?? 0), right: Math.min(win.innerWidth, app?.right ?? win.innerWidth),
            top: Math.max(0, app?.top ?? 0), bottom: Math.min(win.innerHeight, app?.bottom ?? win.innerHeight),
            anchorX: anchor ? (anchor.left + anchor.right) / 2 : win.innerWidth / 2,
            anchorTop: bar?.top ?? anchor?.top ?? win.innerHeight - 28, viewportHeight: win.innerHeight,
        });
        for (const [property, value] of Object.entries(placement)) {
            const css = property === 'maxHeight' ? 'max-height' : property;
            if (this.root.style.getPropertyValue(css) !== `${value}px`) this.root.style.setProperty(css, `${value}px`);
        }
    }
    private keydown = (event: KeyboardEvent): void => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.close(); return; }
        if (event.key === 'Tab') { this.close(); return; }
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation();
        let index = this.rows.indexOf(this.doc.activeElement as HTMLButtonElement);
        if (event.key === 'Home') index = 0;
        else if (event.key === 'End') index = this.rows.length - 1;
        else index = (index + (event.key === 'ArrowDown' ? 1 : -1) + this.rows.length) % this.rows.length;
        this.rows[index]?.focus({ preventScroll: true }); this.rows[index]?.scrollIntoView({ block: 'nearest' });
    };
    private outside = (event: PointerEvent): void => {
        if (!(event.target instanceof this.win.Node) || this.root?.contains(event.target) || this.anchor?.contains(event.target)) return;
        this.close(false);
    };
    private blur = (): void => this.close(false);
    close(restoreFocus = true): void {
        if (!this.root) return;
        this.root.remove(); this.root = null; this.rows = [];
        this.doc.removeEventListener('pointerdown', this.outside, true); this.win.removeEventListener('blur', this.blur);
        this.lease?.release(); this.lease = null;
        this.anchor?.setAttribute('aria-expanded', 'false'); this.anchor?.removeAttribute('aria-controls');
        if (restoreFocus && this.anchor?.isConnected && !this.anchor.disabled) this.anchor.focus({ preventScroll: true });
        this.onClose();
    }
}
