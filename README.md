# Keyline interactions

The optional editing and navigation companion for the [Keyline theme](https://github.com/BADtoBad/obsidian-keyline).

[中文](README.zh-CN.md) · [Downloads](https://github.com/BADtoBad/keyline-interactions/releases)

## Features

- Block drag handles, contextual insertion, and selected-text formatting.
- Passive `@` suggestions for dates, times and pages. Nothing becomes a link until you choose a page; dismissing the menu preserves the original text.
- Native File Explorer icons and contextual actions, without replacing its file operations.
- A quiet, centred workspace switcher using Obsidian’s Workspaces core plugin.
- Searchable settings for Interface, Typography, Icons, Editing, Insert and Advanced.
- English and Chinese interface text, following Obsidian’s language. Restart after a language change. Stored paths, names, and note contents are unchanged.

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
