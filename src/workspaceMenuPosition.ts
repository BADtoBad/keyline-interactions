/** Bottom-anchored DOM menu. Never use screen coordinates or a native menu. */
export function workspaceMenuPosition(input: {
    left: number; right: number; top: number; bottom: number;
    anchorX: number; anchorTop: number; viewportHeight: number;
}): { left: number; bottom: number; width: number; maxHeight: number } {
    const edge = 8, gap = 6;
    const width = Math.max(0, Math.min(264, input.right - input.left - edge * 2));
    const bottomEdge = Math.max(input.top + edge, Math.min(input.anchorTop - gap, input.bottom - edge));
    return {
        left: Math.max(input.left + edge, Math.min(input.anchorX - width / 2, input.right - edge - width)),
        bottom: input.viewportHeight - bottomEdge,
        width,
        maxHeight: Math.max(0, Math.min(360, bottomEdge - input.top - edge)),
    };
}
