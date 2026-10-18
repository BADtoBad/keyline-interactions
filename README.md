# Keyline interactions

**Less menu hunting. More writing.**

Move a paragraph, format a selection, insert a date or return to a saved workspace without breaking your train of thought. Keyline interactions brings everyday editing and navigation controls closer to the content you are working on, while keeping your choices explicit and your files in Obsidian.

[中文](README.zh-CN.md) · [Downloads](https://github.com/BADtoBad/keyline-interactions/releases)

![Light mode: selected-text formatting toolbar and file-type icons in the native File Explorer](assets/keyline-showcase-editing.png)

The formatting toolbar and file-type icons above come from Keyline interactions. These native screenshots use the fictional, all-English [Keyline Studio example Vault](https://github.com/BADtoBad/obsidian-keyline#try-the-example-vault), the optional Keyline theme, and **Bucket Sidebar on the right**. Bucket is a separate plugin.

## Edit where you are working

- **Keep common actions close.** Drag handles help rearrange blocks; contextual insertion and a selected-text toolbar put formatting beside the text instead of in a distant menu.
- **Get suggestions without surrendering control.** Type `@` for dates, times and pages. Only choosing a page creates a link. Dismiss the menu and your input stays as written, including a literal `@` or an email address.
- **Recognise files at a glance.** Distinct icons identify notes, PDFs, EPUBs, audio, images and Canvas files in the native File Explorer. The icons identify formats; they do not install readers for them.
- **Keep navigation familiar.** Explorer shortcuts use Obsidian’s existing file operations. Paired with the Keyline theme, row actions appear over the right-hand text area when needed rather than reserving a permanent blank column.

## Return to the right workspace

Move between writing, research and planning layouts from a quiet, centred status-bar control. Its menu opens inside the window and offers saved layouts, saving the current layout and restoring the layout from before a switch. It uses Obsidian’s **Workspaces** core plugin; it does not automatically overwrite your saved layouts.

![Dark mode: the workspace menu opens above the centred status-bar switcher](assets/keyline-showcase-workspace.png)

## Find settings without the long scroll

Search across six focused categories: Interface, Typography, Icons, Editing, Insert and Advanced. Adjust typography, choose icons, or turn off hover hints without searching one long list. Hiding hints does not hide error messages or confirmation dialogs. Menus, settings and notices support English and Chinese.

![English Keyline settings with aligned category navigation and a settings search field](assets/settings-en.png)

This English settings screenshot was captured in 0.7.3; 0.7.4 retains the layout. Chinese uses the same controls.

## Recommended companions

Pair this plugin with the **[Keyline theme](https://github.com/BADtoBad/obsidian-keyline)** for a coordinated, ready-to-use appearance. Add **[Bucket Sidebar](https://github.com/BADtoBad/obsidian-bucket-sidebar)** if you also want custom groups of file references. The theme works independently and this plugin does not require Bucket.

## Install / upgrade

Current release: **0.7.4, GitHub preview**. It is not available in the Community catalogue. In Obsidian’s plugin list, this companion is named **Keyline**, not Keyline interactions.

Requires **Obsidian 1.7.7 or newer on desktop**. Back up `.obsidian` and close the Vault first. Copy `main.js`, `manifest.json`, and `styles.css` from Releases into:

`.obsidian/plugins/notion-craft-interaction-lab/`

The historical plugin ID is retained for upgrade compatibility. Keep your existing `data.json`. Reopen Obsidian and enable **Keyline** under Community plugins. The plugin is optional; uninstalling it does not remove your Markdown notes.

## Language and compatibility

The interface follows Obsidian’s language; restart after changing it. Stored paths, names and note contents are not translated. The workspace switcher requires the **Workspaces** core plugin. Do not run it alongside another automatic workspace switcher. Iconic and other file-icon or layout snippets can override the same visual surfaces; test combinations in a separate Vault.

Marginalia is a separate optional integration, not bundled here. Its actions are unavailable when it is absent. The plugin makes no remote network requests for normal editing operations.

Community submission is on hold pending publicly documented upstream permission. Automated tests and macOS checks are recorded in [release verification](RELEASE-VERIFICATION.md); old-Mac hardware and all plugin combinations are not certified. Please report reproducible issues without private note content.

## Build and test

Use Node.js 22 and pnpm 10.11.0:

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm pretest
pnpm test
pnpm build
```

The production build writes `main.js` locally. Development only copies into a Vault when `VAULT_PLUGIN_DIR` is explicitly set.

## Provenance

Keyline interactions derives from the local Notion Markdown Guard fork of [Feel the Notion](https://github.com/MichaelNguyen5653/feel-the-notion) 0.6.0 (snapshot `92eea6ba535376e1e56527e5a28c3a11cc994c4d`), whose upstream is [BCS1037/notion-block](https://github.com/BCS1037/notion-block) 1.4.0. Original MIT copyright notices are retained. A distinct product name does not erase that lineage or imply upstream endorsement.

MIT. Retained copyright and third-party notices are in [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
