import { App, getIcon, WorkspaceLeaf } from 'obsidian';
import { FileIconSettings, ResolvedFileIcon, iconColorCss, resolveFileIcon } from './fileIconModel';
import { getKeylineIdentityAsset } from './fileIconAssets';

/** One renderer for native/Bucket Sidebar, Tab and picker. Default assets are restored from
 * the accepted pre-Quiet set; explicit Lucide choices keep their own identity. */
export function createIdentityGlyph(doc: Document, icon: string): SVGSVGElement {
    const asset = getKeylineIdentityAsset(icon);
    const source = asset ? null : getIcon(`lucide-${icon}`) ?? getIcon('lucide-file');
    const svg = source ? doc.importNode(source, true) : doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    if (asset) {
        svg.setAttribute('viewBox', '0 0 24 24');
        const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', asset.path);
        svg.append(path);
    }
    svg.classList.add('ncl-file-identity-glyph');
    svg.dataset.nclIcon = icon;
    svg.dataset.nclIconPaint = asset?.paint ?? 'stroke';
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    return svg;
}
export function paintIdentity(slot: HTMLElement, appearance: ResolvedFileIcon): void {
    const existing = slot.querySelector<SVGSVGElement>(':scope > .ncl-file-identity-glyph');
    if (!existing || existing.dataset.nclIcon !== appearance.icon) {
        existing?.remove();
        slot.append(createIdentityGlyph(slot.ownerDocument, appearance.icon));
    }
    const color = iconColorCss(appearance.color);
    if (slot.style.getPropertyValue('--ncl-identity-color') !== color) slot.style.setProperty('--ncl-identity-color', color);
    if (!slot.classList.contains('ncl-icon-managed')) slot.classList.add('ncl-icon-managed');
}
export function clearIdentity(slot: HTMLElement): void {
    slot.querySelector(':scope > .ncl-file-identity-glyph')?.remove();
    slot.classList.remove('ncl-icon-managed');
    slot.style.removeProperty('--ncl-identity-color');
}
export const hasExternalIcon = (element: HTMLElement): boolean => element.matches('.iconic-icon, .iconic-sidekick') || !!element.querySelector('.iconic-icon, .iconic-sidekick');

/** Share the resolved identity with the filename, not its actions or badge.
 * Selection stays CSS-owned. No computed-style reads or selection listeners;
 * unchanged refreshes do not write attributes or wake the existing observers. */
export function paintFileSelectionColor(row: HTMLElement, appearance: ResolvedFileIcon): void {
    const color = iconColorCss(appearance.color);
    if (row.style.getPropertyValue('--ncl-file-selection-color') !== color) {
        row.style.setProperty('--ncl-file-selection-color', color);
    }
}
export function clearFileSelectionColor(row: HTMLElement): void {
    if (row.style.getPropertyValue('--ncl-file-selection-color')) row.style.removeProperty('--ncl-file-selection-color');
}

/** Background tabs can be DeferredViews on startup. Read their saved identity
 * without loading/activating every document (or guessing from its title). */
export function tabFilePath(leaf: WorkspaceLeaf): string | null {
    const file = (leaf.view as typeof leaf.view & { file?: { path: string } }).file;
    if (file?.path && !leaf.isDeferred) return file.path;
    const state = leaf.getViewState?.();
    if (!state || ['empty', 'search', 'graph', 'backlink', 'outline', 'bucket-sidebar-view'].includes(state.type)) return null;
    return typeof state.state?.file === 'string' && state.state.file ? state.state.file : null;
}

/** Uses leaf identity, never title-text matching (duplicate basenames are common).
 * tabHeaderEl is a guarded core DOM integration; unknown future DOM fails closed.
 * Core's SVGs remain attached and are only hidden while our glyph is present. */
export class FileIconManager {
    private active = false;
    private frame: number | null = null;
    private slots = new Set<HTMLElement>();
    private fileRows = new Set<HTMLElement>();
    private observers = new Map<HTMLElement, MutationObserver>();
    private discovery = new Map<Document, MutationObserver>();
    constructor(private app: App, private settings: () => FileIconSettings) {}

    ownsIcons(): boolean {
        const plugins = (this.app as App & { plugins?: { enabledPlugins?: Set<string> } }).plugins;
        return this.settings().enabled && !plugins?.enabledPlugins?.has('iconic');
    }
    resolve(path: string, folder = false, extension = '', expanded = false): ResolvedFileIcon {
        return resolveFileIcon(this.settings(), path, folder, extension, expanded);
    }
    start(): void {
        this.active = true;
        this.observeDiscovery(document);
        this.refresh();
    }
    stop(): void {
        this.active = false;
        if (this.frame !== null) window.cancelAnimationFrame(this.frame);
        this.frame = null;
        for (const observer of this.observers.values()) observer.disconnect();
        this.observers.clear();
        for (const observer of this.discovery.values()) observer.disconnect();
        this.discovery.clear();
        for (const slot of this.slots) clearIdentity(slot);
        this.slots.clear();
        for (const row of this.fileRows) clearFileSelectionColor(row);
        this.fileRows.clear();
    }
    private schedule(): void {
        if (!this.active || this.frame !== null) return;
        this.frame = window.requestAnimationFrame(() => { this.frame = null; this.refresh(); });
    }
    /** A sidebar may finish restoring after onLayoutReady, before there is a
     * contentEl to observe. Discover new view roots without requiring a tab
     * click. Ignore row/glyph churn and editor text to avoid a repaint loop. */
    private observeDiscovery(doc: Document): void {
        if (this.discovery.has(doc) || !doc.body) return;
        const win = doc.defaultView;
        if (!win) return;
        const selector = '.bucket-sidebar-root, .workspace-leaf-content, .workspace-tab-header';
        const observer = new win.MutationObserver(records => {
            if (records.some(record => Array.from(record.addedNodes).concat(Array.from(record.removedNodes))
                .some(node => node.instanceOf(win.Element) && (node.matches(selector) || node.querySelector(selector))))) this.schedule();
        });
        observer.observe(doc.body, {childList: true, subtree: true});
        this.discovery.set(doc, observer);
    }
    private observe(root: HTMLElement): void {
        if (this.observers.has(root)) return;
        const Observer = root.ownerDocument.defaultView?.MutationObserver;
        if (!Observer) return;
        const observer = new Observer(() => this.schedule());
        observer.observe(root, { childList: true, subtree: true, attributes: true,
            attributeFilter: ['data-type', 'class', 'data-bucket-path', 'data-bucket-kind', 'aria-expanded'] });
        this.observers.set(root, observer);
    }
    refresh(): void {
        if (!this.active) return;
        const roots = new Set<HTMLElement>(), painted = new Set<HTMLElement>();
        const fileRows = new Set<HTMLElement>();
        const documents = new Set<Document>([document]);
        this.app.workspace.iterateAllLeaves((leaf: WorkspaceLeaf) => {
            const doc = leaf.view.containerEl?.ownerDocument;
            if (doc) { documents.add(doc); this.observeDiscovery(doc); }
            // Bucket publishes path/kind only; rules, overrides, paint and
            // ownership remain here. Semantic Space/group icons are untouched.
            // Observe the stable view container so rerenders/new Spaces inherit
            // icons without coupling either plugin's load order or persistence.
            const content = (leaf.view as typeof leaf.view & { contentEl?: HTMLElement }).contentEl;
            if (leaf.view.getViewType?.() === 'bucket-sidebar-view' && content?.isConnected) {
                roots.add(content);
                this.observe(content);
                content.querySelectorAll<HTMLElement>('.bucket-entry-row[data-bucket-path][data-bucket-kind]').forEach(row => {
                    const path = row.dataset.bucketPath;
                    const kind = row.dataset.bucketKind;
                    const slot = row.querySelector<HTMLElement>(':scope > .bucket-entry-icon');
                    if (!path || !slot || !['file', 'folder'].includes(kind ?? '') || !this.ownsIcons() || hasExternalIcon(row)) return;
                    const expanded = row.querySelector(':scope > .bucket-disclosure')?.getAttribute('aria-expanded') === 'true';
                    const appearance = this.resolve(path, kind === 'folder', '', expanded);
                    paintIdentity(slot, appearance);
                    if (kind === 'file') {
                        paintFileSelectionColor(row, appearance);
                        fileRows.add(row);
                    }
                    painted.add(slot);
                });
            }
            const header = (leaf as WorkspaceLeaf & { tabHeaderEl?: HTMLElement }).tabHeaderEl;
            if (!header?.isConnected || !header.closest('.mod-root')) return;
            roots.add(header);
            this.observe(header);
            const slot = header.querySelector<HTMLElement>('.workspace-tab-header-inner-icon');
            const path = tabFilePath(leaf);
            if (!slot || !path || !this.ownsIcons() || hasExternalIcon(header)) return;
            paintIdentity(slot, this.resolve(path));
            painted.add(slot);
        });
        for (const slot of this.slots) if (!painted.has(slot)) clearIdentity(slot);
        this.slots = painted;
        for (const row of this.fileRows) if (!fileRows.has(row)) clearFileSelectionColor(row);
        this.fileRows = fileRows;
        for (const [root, observer] of this.observers) if (!roots.has(root)) {
            observer.disconnect(); this.observers.delete(root);
        }
        for (const [doc, observer] of this.discovery) if (!documents.has(doc)) {
            observer.disconnect(); this.discovery.delete(doc);
        }
    }
}
