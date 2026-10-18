import { localize } from './locale/ui';
export const SETTINGS_SECTIONS = [
    { id: 'interface', label: localize('界面'), icon: 'panels-top-left', description: localize('导航、菜单与提示。'), keywords: '外观 布局 sidebar 文件导航 workspace 工作区 底栏 切换器 菜单 原生菜单 系统 悬停说明 气泡 提示 tooltip' },
    { id: 'typography', label: localize('排版'), icon: 'type', description: localize('页面、正文、列表与标题。'), keywords: '样式 正文最大宽度 左右留白 编辑视图行高 阅读视图行高 正文换行 段落间距 段前距 段后距 首行缩进 列表行高 列表项间距 列表层级缩进 列表符号与正文间距 无序列表圆点大小 引用缩进 标题段前距 标题段后距 预览 默认' },
    { id: 'icons', label: localize('图标'), icon: 'palette', description: localize('文件类型、图形与颜色。'), keywords: '文件 文件夹 类型 颜色 单色 自动 自定义 markdown pdf 图片 音频 视频 白板 画板 压缩 代码 未知 iconic' },
    { id: 'editing', label: localize('编辑'), icon: 'pencil', description: localize('书写保护、文本选择与块操作。'), keywords: '启用 开启 保护 markdown 语法 符号 可疑 隐藏 内部链接 @ 【【 源码 option alt 粘贴 提醒 选择 菜单 工具条 拖动 拖拽 粒度 延迟 位置 左 右 常驻 折叠 全选 退格 cmd backspace block handle hover selection' },
    { id: 'insert', label: localize('插入'), icon: 'plus', description: localize('触发方式、附件与菜单项目。'), keywords: '加号 斜杠 / 触发 字符 行内 附件 嵌入 命令 隐藏 重排 顺序 排序 自定义 菜单 添加 重置 slash embed command insert' },
    { id: 'advanced', label: localize('高级'), icon: 'settings', description: localize('格式与兼容说明。'), keywords: '日期 时间 格式 兼容 iconic make.md bucket 版本 安全 文件 存储' },
] as const;

export type SettingsSectionId = typeof SETTINGS_SECTIONS[number]['id'];

export function searchTerms(query: string): string[] {
    return query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
}

export function matchesSettingsSearch(text: string, query: string): boolean {
    const haystack = text.toLocaleLowerCase();
    return searchTerms(query).every(term => haystack.includes(term));
}

export function findSettingsSections(query: string): SettingsSectionId[] {
    return SETTINGS_SECTIONS.filter(section => matchesSettingsSearch(
        `${section.label} ${section.description} ${section.keywords}`, query,
    )).map(section => section.id);
}
