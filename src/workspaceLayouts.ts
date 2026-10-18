import { localize } from './locale/ui';
/** Small compatibility boundary around core Workspaces. No monkey patches,
 * settings snapshots, note reads, periodic scans or startup layout restore. */
export type Layout = Record<string, unknown>;
export interface WorkspaceCore {
    workspaces: Record<string, Layout>;
    activeWorkspace: string;
    saveData(): Promise<unknown> | unknown;
    onOpenModal?(): void;
}
export interface LayoutRecovery { version: 1; savedAt: string; active: string; layout: Layout; }
export interface RecoveryStore {
    read(): Promise<LayoutRecovery | null>;
    write(value: LayoutRecovery): Promise<void>;
}
export interface WorkspaceHost {
    core(): WorkspaceCore | null;
    conflict(): boolean;
    getLayout(): Layout;
    changeLayout(layout: Layout): Promise<void>;
}
export const hasWorkspace = (core: WorkspaceCore, name: string): boolean =>
    Object.prototype.hasOwnProperty.call(core.workspaces, name);
export function cloneLayout(value: unknown): Layout {
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        !(value as Layout).main || typeof (value as Layout).main !== 'object') {
        throw new Error(localize('布局数据不完整，未执行切换。'));
    }
    return JSON.parse(JSON.stringify(value)) as Layout;
}
export function readRecovery(text: string): LayoutRecovery {
    const value = JSON.parse(text) as LayoutRecovery;
    if (value.version !== 1 || typeof value.active !== 'string' || typeof value.savedAt !== 'string' || !Number.isFinite(Date.parse(value.savedAt))) {
        throw new Error(localize('恢复备份格式未知，已保留原文件。'));
    }
    return { ...value, layout: cloneLayout(value.layout) };
}
export function alternatingRecoveryStore(adapter: {
    exists(path: string): Promise<boolean>; read(path: string): Promise<string>; write(path: string, data: string): Promise<unknown>;
}, directory: string): RecoveryStore {
    const paths = [0, 1].map(i => `${directory}/workspace-recovery-${i}.json`);
    const readSlots = () => Promise.all(paths.map(async path => {
        try {
            if (!await adapter.exists(path)) return { value: null, error: null };
            return { value: readRecovery(await adapter.read(path)), error: null };
        } catch (error) { return { value: null, error }; }
    }));
    return {
        async read() {
            const slots = await readSlots();
            const values = slots.map(s => s.value).filter((s): s is NonNullable<typeof s> => !!s);
            if (!values.length && slots.some(s => s.error)) throw new Error(localize('恢复备份无法读取，原文件已保留。'));
            return values.sort((a, b) => b.savedAt.localeCompare(a.savedAt))[0] ?? null;
        },
        async write(value) {
            const slots = await readSlots();
            if (slots.every(s => s.error)) throw new Error(localize('恢复备份无法读取，未执行切换。'));
            const index = !slots[0].value ? 0 : !slots[1].value ? 1 : slots[0].value.savedAt <= slots[1].value.savedAt ? 0 : 1;
            const newest = Math.max(0, ...slots.map(s => s.value ? Date.parse(s.value.savedAt) : 0));
            const text = JSON.stringify({ ...value, savedAt: new Date(Math.max(Date.now(), newest + 1)).toISOString() });
            await adapter.write(paths[index], text);
            if (await adapter.read(paths[index]) !== text) throw new Error(localize('切换前备份校验失败，未执行切换。'));
        },
    };
}
export function validateWorkspaceName(value: string): string | null {
    const name = value.trim();
    if (!name) return localize('请输入布局名称。');
    // Older core management calls workspaces.hasOwnProperty directly.
    if (/[\u0000-\u001f\u007f]/.test(name) || name === 'prototype' || Object.getOwnPropertyNames(Object.prototype).includes(name)) {
        return localize('此布局名称不可用，请换一个名称。');
    }
    return null;
}

export class WorkspaceLayouts {
    busy = false;
    private stopped = false;
    constructor(readonly host: WorkspaceHost, private store: RecoveryStore) {}
    stop(): void { this.stopped = true; }
    core(): WorkspaceCore {
        if (this.stopped) throw new Error(localize('Keyline 布局切换已关闭。'));
        if (this.host.conflict()) throw new Error(localize('请先停用 Workspaces Plus / Workspace++，避免两套布局管理同时接管。原布局无需删除。'));
        const core = this.host.core();
        if (!core) throw new Error(localize('请在「设置 → 核心插件」中开启「工作区」。'));
        return core;
    }
    private async exclusively<T>(action: () => Promise<T>): Promise<T> {
        if (this.busy) throw new Error(localize('布局操作进行中，请稍候。'));
        this.busy = true;
        try { return await action(); } finally { this.busy = false; }
    }
    async recovery(): Promise<LayoutRecovery | null> { return this.store.read(); }
    async prepareManagement(): Promise<WorkspaceCore> {
        return this.exclusively(async () => {
            const core = this.core();
            await this.store.write(this.snapshot(core));
            if (this.core() !== core) throw new Error(localize('工作区状态已变化，请重试。'));
            return core;
        });
    }
    async switchTo(name: string): Promise<void> {
        return this.exclusively(async () => {
            const core = this.core();
            if (!hasWorkspace(core, name)) throw new Error(localize('此布局已不存在，请重新选择。'));
            const source = core.workspaces[name];
            await this.apply(core, cloneLayout(source), name, () => {
                if (!hasWorkspace(core, name) || core.workspaces[name] !== source) throw new Error(localize('所选布局已变化，请重新选择。'));
            });
        });
    }
    async restore(): Promise<void> {
        return this.exclusively(async () => {
            const core = this.core(), recovery = await this.store.read();
            if (!recovery) throw new Error(localize('还没有可恢复的切换前布局。'));
            await this.apply(core, recovery.layout, hasWorkspace(core, recovery.active) ? recovery.active : '');
        });
    }
    private snapshot(core: WorkspaceCore): LayoutRecovery {
        return {
            version: 1, savedAt: new Date().toISOString(), active: core.activeWorkspace || '',
            layout: cloneLayout(this.host.getLayout()),
        };
    }
    private async apply(core: WorkspaceCore, layout: Layout, active: string, validate?: () => void): Promise<void> {
        const before = this.snapshot(core);
        // A failed backup must not be followed by a destructive layout change.
        await this.store.write(before);
        if (this.core() !== core) throw new Error(localize('工作区状态已变化，请重试。'));
        validate?.();
        try {
            // In 1.7.7 core.loadWorkspace returns before restoration finishes.
            // Await the same native changeLayout directly on both versions.
            await this.host.changeLayout(cloneLayout(layout));
            core.activeWorkspace = active;
            await core.saveData();
        } catch (cause) {
            try {
                await this.host.changeLayout(cloneLayout(before.layout));
                core.activeWorkspace = before.active;
                await core.saveData();
            } catch {
                throw new Error(localize('布局切换未完成；切换前备份已保留，请通过「恢复切换前布局」重试。'));
            }
            throw new Error(localize('布局切换未完成，已恢复切换前的布局。'));
        }
    }
    async save(value: string, overwrite: boolean): Promise<void> {
        return this.exclusively(async () => {
            const core = this.core(), name = value.trim(), invalid = validateWorkspaceName(value);
            if (invalid) throw new Error(invalid);
            const exists = hasWorkspace(core, name);
            if (exists && !overwrite) throw new Error(localize('已存在同名布局，请换一个名称。'));
            if (overwrite && (!exists || name !== core.activeWorkspace)) throw new Error(localize('当前布局已变化，请重新选择保存。'));
            const previous = core.workspaces[name], previousActive = core.activeWorkspace;
            const next = cloneLayout(this.host.getLayout());
            next.mtime = new Date().toISOString();
            core.workspaces[name] = next;
            core.activeWorkspace = name;
            try { await core.saveData(); }
            catch (cause) {
                if (exists) core.workspaces[name] = previous; else delete core.workspaces[name];
                core.activeWorkspace = previousActive;
                throw new Error(localize('布局未能保存，请检查配置目录的写入权限后重试。'));
            }
        });
    }
}

/** Centre stays fixed; shrink before falling back to a dedicated in-flow row. */
export function workspaceSlot(width: number, left: number, right: number, wrapped: boolean): { width: number; separateRow: boolean; iconOnly: boolean } {
    const available = Math.floor(2 * Math.min(width / 2 - left - 12, right - width / 2 - 12));
    if (wrapped || available < 32) return { width: Math.min(180, Math.max(32, width - 24)), separateRow: true, iconOnly: width < 100 };
    return { width: Math.min(180, available), separateRow: false, iconOnly: available < 80 };
}
