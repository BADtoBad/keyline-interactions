# Keyline 交互插件

**少找菜单，顺手写作。**

移动一段文字、给选区加上格式、插入日期，或回到熟悉的工作布局，不必频繁打断思路。Keyline 交互插件把日常编辑与导航工具放到正在处理的内容附近，同时保留明确的操作选择，让文件继续留在 Obsidian 中。

[English](README.md) · [下载](https://github.com/BADtoBad/keyline-interactions/releases)

![亮色模式：选区格式工具栏与左侧原生文件浏览器的分类图标](assets/keyline-showcase-editing.png)

图中的格式工具栏与文件分类图标由 Keyline 交互插件提供。真实截图使用虚构、全英文的 [Keyline Studio 示例库](https://github.com/BADtoBad/obsidian-keyline#try-the-example-vault)，搭配可选的 Keyline 主题；**右侧 Bucket Sidebar 是独立插件**。

## 就在内容旁完成编辑

- **常用操作，就近完成。** 用拖动手柄调整块的位置，通过上下文菜单插入内容；选中文字后，格式工具栏就在旁边，不必去远处找菜单。
- **给出建议，不替你决定。** 输入 `@`，快捷选择日期、时间或页面。只有选中页面才生成链接；关闭菜单，输入仍保持原样，可以继续写普通的 `@` 或邮箱地址。
- **扫一眼，认出文件类型。** 在原生文件浏览器中，用不同图标区分笔记、PDF、EPUB、音频、图片与 Canvas。图标负责识别类型，不会额外安装对应的阅读器。
- **沿用熟悉的文件操作。** 导航快捷按钮调用 Obsidian 原有的文件操作。搭配 Keyline 主题时，行内按钮在需要时浮在右侧文字上方，不为隐藏按钮常驻预留空白。

## 回到合适的工作布局

从底栏居中的小控件，在写作、研究与计划布局之间切换。菜单向窗口内展开，可以选择已保存布局、保存当前布局，或恢复切换前的布局。使用 Obsidian 核心 **Workspaces** 数据，不自动覆盖你保存的布局。

![暗色模式：工作区菜单在居中的底栏切换器上方弹出](assets/keyline-showcase-workspace.png)

## 不用翻长列表的设置

“界面、排版、图标、编辑、插入、高级”六类设置配合搜索，让排版调整、图标选择和悬停提示开关更容易找到。关闭悬停提示不会隐藏错误消息或确认弹窗。菜单、设置与提示均支持中文和英文。

![英文 Keyline 设置：对齐的分类导航与设置搜索框](assets/settings-en.png)

此英文设置截图来自 0.7.3，0.7.4 保留该布局，中文使用相同控件。

## 推荐搭配

搭配 **[Keyline 主题](https://github.com/BADtoBad/obsidian-keyline)**，获得协调、开箱即用的外观；如需自定义资料分组，再添加 **[Bucket Sidebar](https://github.com/BADtoBad/obsidian-bucket-sidebar)**。主题可独立使用，本插件也不依赖 Bucket。

## 安装与升级

当前版本为 **0.7.4，GitHub 预览版**，尚不能从 Community 目录安装。本插件在 Obsidian 插件列表中显示为 **Keyline**，不是 Keyline interactions。

需要 **Obsidian 1.7.7 或更新的桌面版**。先备份 `.obsidian` 并关闭该库，将 Releases 的 `main.js`、`manifest.json`、`styles.css` 放入：

`.obsidian/plugins/notion-craft-interaction-lab/`

保留旧 ID 是为了兼容升级，不要覆盖自己的 `data.json`。重新打开 Obsidian，在第三方插件中启用 **Keyline**。停用插件不会删除 Markdown 笔记。

## 语言与兼容性

界面跟随 Obsidian 的语言，切换后重启生效；笔记、路径与自定义名称不会被翻译。工作区切换依赖核心插件 **Workspaces**，请避免同时运行其他自动切换器。Iconic、图标插件和布局片段可能覆盖相同界面，建议先在测试库中检查组合效果。

Marginalia 是独立插件，不包含在本包中；未安装时相关操作不可用。常规编辑操作不请求远程网络。

尚缺公开书面的上游独立发布同意，因此暂不提交 Community。自动化和 macOS 检查详见 [发行验证](RELEASE-VERIFICATION.md)，不宣称所有老 Mac 和插件组合均已验证。反馈时请提供不含隐私的复现步骤。

## 构建

使用 Node.js 22 和 pnpm 10.11.0，依次运行 `pnpm install --frozen-lockfile`、`pnpm typecheck`、`pnpm lint`、`pnpm pretest`、`pnpm test`、`pnpm build`。

正式构建只生成本地文件。仅在明确设置 `VAULT_PLUGIN_DIR` 时，开发构建才复制到指定 Vault。

## 来源

Keyline 交互插件基于本地 Notion Markdown Guard 分叉；上游为 [Feel the Notion](https://github.com/MichaelNguyen5653/feel-the-notion) 0.6.0（快照 `92eea6ba535376e1e56527e5a28c3a11cc994c4d`）和 [BCS1037/notion-block](https://github.com/BCS1037/notion-block) 1.4.0。保留原 MIT 版权声明，独立名称不代表独立起源或获得上游背书。

MIT，版权与第三方声明见 [LICENSE](LICENSE) 和 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
