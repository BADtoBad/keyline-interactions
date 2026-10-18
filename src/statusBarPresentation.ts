import { getIcon } from 'obsidian';

// Display substitution only. The original text (including counters, LIVE,
// SKIP, unknown symbols and error messages) is never discarded or inferred.
const symbols: Record<string, string> = {
    '🌐': 'globe', '📲': 'smartphone', '⏹': 'square', '💤': 'pause',
    '🌀': 'refresh-cw', '⚡': 'zap', '📦': 'package', '⏳': 'hourglass',
    '🛫': 'upload', '📬': 'inbox', '⚠': 'triangle-alert', '⛔': 'circle-alert',
    '↑': 'arrow-up', '↓': 'arrow-down',
};
const tokenPattern = /🌐|📲|⏹\uFE0F?|💤|🌀|⚡\uFE0F?|📦|⏳|🛫|📬|⚠\uFE0F?|⛔\uFE0F?|↑|↓/gu;

/** Reversible decorator of LiveSync's text-only status item. No settings,
 * network, plugin internals, click handlers or replication state are touched. */
export class StatusBarPresentation {
    private observer: MutationObserver | null = null;
    private frame: number | null = null;
    private items = new Set<HTMLElement>();
    private get win(): Window & typeof window { return this.doc.defaultView as Window & typeof window; }
    constructor(private doc: Document) {}

    start(): void {
        if (this.observer) return;
        this.observer = new this.win.MutationObserver(records => {
            if (records.some(r => (r.target.instanceOf(this.win.Element) ? r.target : r.target.parentElement)?.closest('.status-bar') ||
                Array.from(r.addedNodes).some(n => n.instanceOf(this.win.Element) &&
                    (n.matches('.status-bar, .syncstatusbar') || n.querySelector('.status-bar, .syncstatusbar'))))) this.schedule();
        });
        this.refresh();
    }

    private schedule(): void {
        if (this.frame !== null) return;
        this.frame = this.win.requestAnimationFrame(() => { this.frame = null; this.refresh(); });
    }

    private release(item: HTMLElement): void {
        // Read the CURRENT token text: never restore an obsolete sync status
        // after LiveSync has replaced/updated the item while we were active.
        for (const token of Array.from(item.querySelectorAll<HTMLElement>('.ncl-status-token'))) {
            token.replaceWith(this.doc.createTextNode(token.querySelector('.ncl-status-source')?.textContent ?? ''));
        }
        for (const content of Array.from(item.querySelectorAll<HTMLElement>('.ncl-status-content'))) {
            content.replaceWith(...Array.from(content.childNodes));
        }
        item.classList.remove('ncl-sync-known', 'ncl-sync-attention');
    }

    refresh(): void {
        if (!this.observer) return;
        // Our SVG/text writes must not recursively trigger the observer.
        this.observer.disconnect();
        for (const item of this.items) this.release(item);
        this.items.clear();
        for (const item of Array.from(this.doc.querySelectorAll<HTMLElement>('.status-bar > .syncstatusbar'))) {
            // A future LiveSync may own structured content; leave that alone.
            if (Array.from(item.childNodes).some(n => n.nodeType !== 3)) continue;
            const text = item.textContent ?? '';
            if (!text.includes('Sync:')) continue;
            // Only a fully recognized routine line is subdued. Errors, SKIP,
            // and any future/unknown status retain their original text/weight.
            const plain = text.replace(tokenPattern, '');
            const routine = /^[\s\d:().]*Sync:[\s\d:().LIVE]*$/.test(plain) &&
                /Sync:\s*(?:⏹\uFE0F?|💤|🌀|⚡\uFE0F?|📦)/u.test(text);
            item.classList.add(routine ? 'ncl-sync-known' : 'ncl-sync-attention');
            this.items.add(item);
            const fragment = this.doc.createDocumentFragment();
            let offset = 0;
            for (const match of text.matchAll(tokenPattern)) {
                const index = match.index ?? 0, raw = match[0];
                const icon = getIcon(symbols[raw.replace(/\uFE0F/g, '')]);
                if (!icon) continue; // No unsupported icon on older Obsidian.
                fragment.append(this.doc.createTextNode(text.slice(offset, index)));
                const token = this.doc.createElement('span'); token.className = 'ncl-status-token';
                if (/⚠|⛔/u.test(raw)) token.classList.add('is-warning');
                const source = this.doc.createElement('span'); source.className = 'ncl-status-source'; source.textContent = raw;
                icon.setAttribute('aria-hidden', 'true');
                token.append(source, icon); fragment.append(token);
                offset = index + raw.length;
            }
            fragment.append(this.doc.createTextNode(text.slice(offset)));
            // One inline formatting context preserves spaces around tokens;
            // individual text nodes as flex children would trim those spaces.
            const content = this.doc.createElement('span'); content.className = 'ncl-status-content';
            content.append(fragment); item.replaceChildren(content);
        }
        this.observer.observe(this.doc.body, { childList: true, subtree: true, characterData: true,
            attributes: true, attributeFilter: ['class'] });
    }

    stop(): void {
        this.observer?.disconnect(); this.observer = null;
        if (this.frame !== null) this.win.cancelAnimationFrame(this.frame);
        this.frame = null;
        for (const item of this.items) this.release(item);
        this.items.clear();
    }
}
