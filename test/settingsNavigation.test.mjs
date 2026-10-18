import assert from 'node:assert/strict';
import test from 'node:test';
import { SETTINGS_SECTIONS, findSettingsSections, matchesSettingsSearch } from './.build/settingsNavigation.js';

test('six short and unique preference categories', () => {
    assert.deepEqual(SETTINGS_SECTIONS.map(x => x.label), ['界面', '排版', '图标', '编辑', '插入', '高级']);
    assert.equal(new Set(SETTINGS_SECTIONS.map(x => x.id)).size, 6);
});
test('cross-category Chinese and Latin preference search', () => {
    for (const [query, section] of [['原生菜单', 'interface'], ['行高', 'typography'], ['段前', 'typography'], ['PDF', 'icons'], ['全选', 'editing'], ['  SLASH ', 'insert'], ['日期', 'advanced']]) {
        assert.ok(findSettingsSections(query).includes(section), query);
    }
    assert.equal(findSettingsSections('').length, 6);
    assert.equal(findSettingsSections('不存在的条目').length, 0);
    assert.equal(matchesSettingsSearch('正文 编辑视图行高', '正文 行高'), true);
});
