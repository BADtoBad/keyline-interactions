# Keyline interactions

The optional editing and navigation companion for the [Keyline theme](https://github.com/BADtoBad/obsidian-keyline).

[中文](README.zh-CN.md) · [Downloads](https://github.com/BADtoBad/keyline-interactions/releases)

**Recommended with the Keyline theme for the editing experience shown below.** In Obsidian’s plugin list, this companion is named **Keyline**; it is not the theme itself. [Bucket Sidebar](https://github.com/BADtoBad/obsidian-bucket-sidebar) is a separate, optional plugin for curated groups. The theme works without either plugin, and this plugin does not require Bucket.

This is a **GitHub preview**, installed manually as described below; it is not yet available in the Community catalogue.

## Features

- Block drag handles, contextual insertion, and selected-text formatting.
- Passive `@` suggestions for dates, times and pages. Nothing becomes a link until you choose a page; dismissing the menu preserves the original text.
- Native File Explorer icons and contextual actions, without replacing its file operations.
- A quiet, centred workspace switcher using Obsidian’s Workspaces core plugin.
- Searchable settings for Interface, Typography, Icons, Editing, Insert and Advanced.
- English and Chinese interface text, following Obsidian’s language. Restart after a language change. Stored paths, names, and note contents are unchanged.

## Screenshots

Native Obsidian screenshots from the fictional, all-English [Keyline Studio example Vault](https://github.com/BADtoBad/obsidian-keyline#try-the-example-vault), shown with the optional Keyline theme. The **right-hand grouped sidebar is Bucket Sidebar**, not part of this plugin.

### Light — editing and file-type icons

Select text to reveal the formatting toolbar. The native File Explorer on the left distinguishes notes, audio, Canvas, EPUB, PDF and image files with different icons. Icons identify files; they do not add readers for unsupported formats.

![Light mode: selected-text formatting toolbar and file-type icons in the native File Explorer](assets/keyline-showcase-editing.png)

### Dark — workspace switching

The centred status-bar control opens an in-window menu for saved layouts. It uses Obsidian’s **Workspaces** core plugin.

![Dark mode: the workspace menu opens above the centred status-bar switcher](assets/keyline-showcase-workspace.png)

### Organised, bilingual settings

Search across Interface, Typography, Icons, Editing, Insert and Advanced. The screenshot shows the English interface captured in 0.7.3; 0.7.4 retains this layout. Chinese uses the same controls and follows Obsidian’s language after a restart.

![English Keyline settings with aligned category navigation and a settings search field](assets/settings-en.png)

## Install / upgrade

Requires **Obsidian 1.7.7 or newer on desktop**. Back up `.obsidian` and close the Vault first. Copy `main.js`, `manifest.json`, and `styles.css` from Releases into:

`.obsidian/plugins/notion-craft-interaction-lab/`

The historical plugin ID is retained for upgrade compatibility. Keep your existing `data.json`. Reopen Obsidian and enable **Keyline** under Community plugins. The plugin is optional; uninstalling it does not remove your Markdown notes.

The workspace switcher requires the **Workspaces** core plugin. Do not run it alongside another automatic workspace switcher. Iconic and other file-icon or layout snippets can override the same visual surfaces; test combinations in a separate Vault.

Marginalia is a separate optional integration, not bundled here. Its actions are unavailable when it is absent. The plugin makes no remote network requests for normal editing operations.

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

## Release status

Public preview: **0.7.4**. Community submission is on hold pending publicly documented upstream permission. Automated tests and macOS checks are recorded in [release verification](RELEASE-VERIFICATION.md); old-Mac hardware and all plugin combinations are not certified. Please report reproducible issues without private note content.

## Provenance

Keyline interactions derives from the local Notion Markdown Guard fork of [Feel the Notion](https://github.com/MichaelNguyen5653/feel-the-notion) 0.6.0 (snapshot `92eea6ba535376e1e56527e5a28c3a11cc994c4d`), whose upstream is [BCS1037/notion-block](https://github.com/BCS1037/notion-block) 1.4.0. Original MIT copyright notices are retained. A distinct product name does not erase that lineage or imply upstream endorsement.

MIT. Retained copyright and third-party notices are in [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
