import { localize } from './locale/ui';
import { App, Menu, Platform } from 'obsidian';

type MenuCore = typeof Menu & { useNativeMenu?: boolean | null };
type ConfigVault = { getConfig?: (key: string) => unknown; setConfig?: (key: string, value: boolean) => unknown };

/** Bridge the existing core preference; never maintain a second plugin copy.
 * Both 1.7.7 and 1.13.7 use this key/static flag. No prototype or IPC patches. */
export function readNativeMenuPreference(app: App): boolean | null {
    const vault = app.vault as unknown as ConfigVault;
    if (!Platform.isDesktopApp || typeof vault.getConfig !== 'function' || typeof vault.setConfig !== 'function') return null;
    if (!('useNativeMenu' in Menu)) return null;
    const value = (Menu as MenuCore).useNativeMenu;
    if (typeof value === 'boolean') return value;
    const saved = vault.getConfig('nativeMenus');
    return typeof saved === 'boolean' ? saved : Platform.isMacOS;
}

/** Called only by the user's explicit setting change, never at startup. */
export async function writeNativeMenuPreference(app: App, native: boolean): Promise<void> {
    if (readNativeMenuPreference(app) === null) throw new Error(localize('此版本未提供可用的菜单设置'));
    const vault = app.vault as unknown as Required<ConfigVault>;
    await vault.setConfig('nativeMenus', native);
    // Legacy core's settings UI sets this flag itself; newer core also updates
    // it from its config-change event. Assigning the same value is harmless.
    (Menu as MenuCore).useNativeMenu = native;
}
