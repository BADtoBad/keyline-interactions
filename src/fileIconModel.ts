import { localize } from './locale/ui';
import { fileVisualKindForPath, FileVisualKind } from './nativeFileExplorerModel';

export type IconKind = FileVisualKind | 'folder';
export const ICON_COLORS = ['gray', 'blue', 'red', 'green', 'purple', 'amber', 'cyan', 'orange', 'pink'] as const;
export type IconColor = string;
export interface IconOverride { icon?: string; color?: IconColor }
export interface FileIconSettings {
    enabled: boolean;
    monochrome: boolean;
    types: Partial<Record<IconKind, IconOverride>>;
    files: Record<string, IconOverride>;
}
export const ICON_DEFAULTS: Record<IconKind, { label: string; icon: string; color: IconColor }> = {
    markdown: { label: localize('Markdown 笔记'), icon: 'keyline-file-text', color: 'blue' },
    pdf: { label: localize('PDF 文档'), icon: 'keyline-file-text', color: 'red' },
    epub: { label: localize('EPUB 电子书'), icon: 'keyline-file-text', color: 'amber' },
    image: { label: localize('图片'), icon: 'keyline-file-image', color: 'green' },
    audio: { label: localize('音频'), icon: 'file-audio', color: 'purple' },
    video: { label: localize('视频'), icon: 'file-video', color: 'pink' },
    canvas: { label: localize('Canvas 画布'), icon: 'layout-dashboard', color: 'cyan' },
    code: { label: localize('代码与配置'), icon: 'file-code', color: 'blue' },
    archive: { label: localize('压缩文件'), icon: 'file-archive', color: 'orange' },
    generic: { label: localize('其他文件'), icon: 'keyline-file-text', color: 'gray' },
    folder: { label: localize('文件夹'), icon: 'keyline-folder', color: 'gray' },
};
const record = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
export function normalizeIconOverride(value: unknown): IconOverride {
    const v = record(value), result: IconOverride = {};
    if (typeof v.icon === 'string') {
        const icon = v.icon.trim().replace(/^lucide-/, '');
        if (/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(icon) && icon.length <= 80) result.icon = icon;
    }
    if (typeof v.color === 'string') {
        const color = v.color.trim().toLowerCase();
        if ((ICON_COLORS as readonly string[]).includes(color) || /^#[\da-f]{6}$/.test(color)) result.color = color;
    }
    return result;
}
export function normalizeFileIconSettings(value?: unknown): FileIconSettings {
    const v = record(value);
    const types = Object.fromEntries(Object.entries(record(v.types)).filter(([key]) => Object.prototype.hasOwnProperty.call(ICON_DEFAULTS, key))
        .map(([key, val]) => [key, normalizeIconOverride(val)]));
    const files: Record<string, IconOverride> = Object.assign(Object.create(null) as Record<string, IconOverride>, Object.fromEntries(
        Object.entries(record(v.files)).filter(([key]) => key && !key.startsWith('/') && !key.split('/').some(p => p === '..' || p === '.'))
        .map(([key, val]): [string, IconOverride] => [key, normalizeIconOverride(val)]).filter(([, val]) => Object.keys(val).length)));
    return { enabled: v.enabled !== false, monochrome: v.monochrome === true, types, files };
}
export interface ResolvedFileIcon { kind: IconKind; icon: string; color: IconColor; iconSource: string; colorSource: string }
export function resolveFileIcon(settings: FileIconSettings, path: string, folder = false, extensionHint = '', expanded = false): ResolvedFileIcon {
    const kind = folder ? 'folder' : fileVisualKindForPath(path, extensionHint);
    const builtin = ICON_DEFAULTS[kind], type = settings.types[kind] ?? {};
    const file = Object.prototype.hasOwnProperty.call(settings.files, path) ? settings.files[path] : {};
    return {
        kind,
        icon: file.icon ?? type.icon ?? (folder && expanded ? 'keyline-folder-open' : builtin.icon),
        color: settings.monochrome ? 'gray' : file.color ?? type.color ?? builtin.color,
        iconSource: file.icon ? localize('文件自定义') : type.icon ? localize('类型默认') : localize('内置默认'),
        colorSource: settings.monochrome ? localize('单色模式') : file.color ? localize('文件自定义') : type.color ? localize('类型默认') : localize('内置默认'),
    };
}
export const iconColorCss = (color: IconColor): string => /^#[\da-f]{6}$/i.test(color) ? color : `var(--ncl-icon-${(ICON_COLORS as readonly string[]).includes(color) ? color : 'gray'})`;

/** Segment-aware paths: a folder rename must not change a sibling's override. */
export function moveFileIconOverrides(settings: FileIconSettings, oldPath: string, newPath: string | null): boolean {
    const affected = Object.entries(settings.files).filter(([key]) => key === oldPath || key.startsWith(oldPath + '/'));
    for (const [key] of affected) delete settings.files[key];
    if (newPath !== null) for (const [key, value] of affected) settings.files[newPath + key.slice(oldPath.length)] = value;
    return affected.length > 0;
}
