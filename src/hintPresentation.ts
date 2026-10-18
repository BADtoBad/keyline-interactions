/** Presentation only: standard Obsidian tooltips, not link previews/notices.
 * Two delegated listeners, no timer, DOM scan or MutationObserver. */
export class HintPresentation {
    private active = false;
    private borrowed: { el: HTMLElement; title: string } | null = null;
    constructor(private readonly doc: Document) {}

    refresh(showHints: boolean): void {
        const win = this.doc.defaultView;
        const enabled = !!win && win.getComputedStyle(this.doc.body).getPropertyValue('--ncl-shell-controls').trim() === '1';
        const quiet = enabled && !showHints;
        if (this.doc.body.classList.contains('ncl-quiet-hints') !== quiet) this.doc.body.classList.toggle('ncl-quiet-hints', quiet);
        if (enabled === this.active) return;
        this.active = enabled;
        if (enabled) {
            this.doc.addEventListener('mouseover', this.deduplicate, true);
            this.doc.addEventListener('mouseout', this.leave, true);
        } else this.detach();
    }

    private restore(): void {
        const item = this.borrowed;
        this.borrowed = null;
        // Do not overwrite another owner's subsequent attribute change.
        if (item && !item.el.hasAttribute('title')) item.el.setAttribute('title', item.title);
    }

    private deduplicate = (event: MouseEvent): void => {
        const target = event.target as Element | null;
        if (!target?.closest) return;
        const button = target.closest<HTMLElement>('.bucket-sidebar-root button[aria-label], .ncl-settings button[aria-label]');
        if (button === this.borrowed?.el) return;
        this.restore();
        const title = button?.getAttribute('title');
        // Only duplicate operation labels, not filename/path titles or content.
        if (button && title && title === button.getAttribute('aria-label')) {
            this.borrowed = { el: button, title };
            button.removeAttribute('title');
        }
    };

    private leave = (event: MouseEvent): void => {
        if (this.borrowed && !(event.relatedTarget && this.borrowed.el.contains(event.relatedTarget as Node))) this.restore();
    };

    private detach(): void {
        this.doc.removeEventListener('mouseover', this.deduplicate, true);
        this.doc.removeEventListener('mouseout', this.leave, true);
        this.restore();
    }

    stop(): void {
        this.active = false;
        this.detach();
        this.doc.body.classList.remove('ncl-quiet-hints');
    }
}
