export type FloatingSurfaceKind = "insert-menu" | "action-menu" | "native-menu" | "drag";

export type FloatingSurfaceCloseReason =
	| "replaced"
	| "escape"
	| "outside"
	| "completed"
	| "cancelled"
	| "viewport"
	| "programmatic"
	| "unload";

export interface FloatingSurfaceOptions {
	/**
	 * A fixed menu is no longer anchored correctly after the editor scrolls or
	 * the window changes size. Close it rather than leaving a detached surface.
	 * Drag deliberately leaves this off so scrolling can continue a drag.
	 */
	dismissOnViewportChange?: boolean;
	/** Internal menu-list scrolling must not be mistaken for editor scrolling. */
	containsEventTarget?: (target: EventTarget | null) => boolean;
}

export interface FloatingSurfaceLease {
	readonly kind: FloatingSurfaceKind;
	readonly active: boolean;
	release(): void;
	close(reason?: FloatingSurfaceCloseReason): void;
}

interface ActiveSurface {
	token: symbol;
	kind: FloatingSurfaceKind;
	close: (reason: FloatingSurfaceCloseReason) => void;
	cleanup?: () => void;
}

const SURFACE_KINDS: FloatingSurfaceKind[] = ["insert-menu", "action-menu", "native-menu", "drag"];

/**
 * One arbitration point for every body-level editor surface.
 *
 * CodeMirror tooltips remain owned by CodeMirror, but the body classes emitted
 * here let them yield while an exclusive menu or drag surface is active. A
 * coordinator is scoped to one plugin instance and tracks pop-out documents
 * independently.
 */
export class FloatingSurfaceCoordinator {
	private readonly activeByDocument = new Map<Document, ActiveSurface>();

	claim(
		doc: Document,
		kind: FloatingSurfaceKind,
		close: (reason: FloatingSurfaceCloseReason) => void,
		options: FloatingSurfaceOptions = {}
	): FloatingSurfaceLease {
		this.close(doc, "replaced");

		const token = Symbol(kind);
		const active: ActiveSurface = { token, kind, close };
		this.activeByDocument.set(doc, active);
		active.cleanup = this.bindViewportLifecycle(doc, token, options);
		this.syncBodyState(doc);
		const isActive = () => this.isActive(doc, token);

		return {
			kind,
			get active(): boolean {
				return isActive();
			},
			release: () => this.release(doc, token),
			close: (reason = "programmatic") => this.closeToken(doc, token, reason),
		};
	}

	activeKind(doc: Document): FloatingSurfaceKind | null {
		return this.activeByDocument.get(doc)?.kind ?? null;
	}

	close(doc: Document, reason: FloatingSurfaceCloseReason = "programmatic"): void {
		const current = this.activeByDocument.get(doc);
		if (!current) return;
		this.activeByDocument.delete(doc);
		current.cleanup?.();
		this.syncBodyState(doc);
		current.close(reason);
	}

	closeAll(reason: FloatingSurfaceCloseReason = "unload"): void {
		for (const doc of Array.from(this.activeByDocument.keys())) {
			this.close(doc, reason);
		}
	}

	private isActive(doc: Document, token: symbol): boolean {
		return this.activeByDocument.get(doc)?.token === token;
	}

	private release(doc: Document, token: symbol): void {
		const current = this.activeByDocument.get(doc);
		if (current?.token !== token) return;
		this.activeByDocument.delete(doc);
		current.cleanup?.();
		this.syncBodyState(doc);
	}

	private closeToken(
		doc: Document,
		token: symbol,
		reason: FloatingSurfaceCloseReason
	): void {
		if (!this.isActive(doc, token)) return;
		this.close(doc, reason);
	}

	private bindViewportLifecycle(
		doc: Document,
		token: symbol,
		options: FloatingSurfaceOptions
	): (() => void) | undefined {
		if (!options.dismissOnViewportChange) return undefined;

		const onScroll = (event: Event): void => {
			if (options.containsEventTarget?.(event.target)) return;
			this.closeToken(doc, token, "viewport");
		};
		const onResize = (): void => this.closeToken(doc, token, "viewport");

		doc.addEventListener("scroll", onScroll, true);
		doc.defaultView?.addEventListener("resize", onResize);

		return () => {
			doc.removeEventListener("scroll", onScroll, true);
			doc.defaultView?.removeEventListener("resize", onResize);
		};
	}

	private syncBodyState(doc: Document): void {
		const active = this.activeByDocument.get(doc);
		doc.body.classList.toggle("ncl-exclusive-surface-open", Boolean(active));
		for (const kind of SURFACE_KINDS) {
			doc.body.classList.toggle(`ncl-surface-${kind}`, active?.kind === kind);
		}
	}
}
