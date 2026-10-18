# Keyline 交互插件

[Keyline 主题](https://github.com/BADtoBad/obsidian-keyline)的可选编辑与导航组件。

[English](README.md) · [下载](https://github.com/BADtoBad/keyline-interactions/releases)

## 功能

- 段落拖动、上下文插入菜单与选区格式工具栏。
- `@` 打开日期、时间和页面建议；只有主动选择页面时才生成双向链接，关闭菜单不会改写原文。
- 原生文件导航的图标与快捷操作，不接管文件读写规则。
- 居中的底栏工作区切换器，使用 Obsidian 核心 Workspaces 数据。
- 可搜索的“界面、排版、图标、编辑、插入、高级”六类设置。
- 中英文菜单、设置与提示，跟随 Obsidian 界面语言，切换后重启生效。不会翻译笔记、路径或自定义名称。

## 安装与升级

需要 **Obsidian 1.7.7 或更新的桌面版**。先备份 `.obsidian` 并关闭该库，将 Releases 的 `main.js`、`manifest.json`、`styles.css` 放入：

`.obsidian/plugins/notion-craft-interaction-lab/`

保留旧 ID 是为了兼容升级，不要覆盖自己的 `data.json`。重新打开 Obsidian，在第三方插件中启用 **Keyline**。停用插件不会删除 Markdown 笔记。

工作区切换依赖核心插件 **Workspaces**，请避免同时运行其他自动切换器。Iconic、图标插件和布局片段可能覆盖相同界面，建议先在测试库中检查组合效果。

Marginalia 是独立插件，不包含在本包中；未安装时相关操作不可用。常规编辑操作不请求远程网络。

## 构建

使用 Node.js 22 和 pnpm 10.11.0，依次运行 `pnpm install --frozen-lockfile`、`pnpm typecheck`、`pnpm pretest`、`pnpm test`、`pnpm build`。

正式构建只生成本地文件。仅在明确设置 `VAULT_PLUGIN_DIR` 时，开发构建才复制到指定 Vault。

## 发行与许可

首次公开双语预览版 **0.7.3**，发行前包含自动化模型测试和 macOS Obsidian 1.13.7 界面检查，不宣称所有老 Mac 和插件组合均已验证。反馈时请提供不含隐私的复现步骤。

MIT，版权与第三方声明见 [LICENSE](LICENSE) 和 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
