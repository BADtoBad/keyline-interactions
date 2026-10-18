import test from 'node:test';
import assert from 'node:assert/strict';
import { localize, interfaceLanguage } from './.build/locale/ui.js';

test('UI language follows Obsidian and falls back to English', () => {
  try {
    for (const lang of ['en', 'fr', null]) {
      globalThis.window = { localStorage: { getItem: () => lang } };
      assert.equal(interfaceLanguage(), 'en');
      assert.equal(localize('今天'), 'Today');
    }
    for (const lang of ['zh', 'zh-CN', 'zh-TW']) {
      globalThis.window = { localStorage: { getItem: () => lang } };
      assert.equal(localize('今天'), '今天');
    }
  } finally { delete globalThis.window; }
});

test('translated templates never recursively interpolate user text', () => {
  try {
    globalThis.window = { localStorage: { getItem: () => 'en' } };
    const name = '用户的 {1} 项目';
    assert.equal(localize`收起 ${name}`, `Collapse ${name}`);
    assert.equal(localize('My private project'), 'My private project');
    assert.equal(localize('用户自定义文字'), '用户自定义文字');
  } finally { delete globalThis.window; }
});

test('restricted storage uses a safe fallback', () => {
  try {
    globalThis.window = { get localStorage() { throw new Error('blocked'); } };
    assert.equal(interfaceLanguage(), 'en');
  } finally { delete globalThis.window; }
});

test('fresh Obsidian profiles inherit their actual interface language', () => {
  try {
    globalThis.window = { localStorage: { getItem: () => null } };
    globalThis.document = { documentElement: { lang: 'zh-CN' } };
    assert.equal(interfaceLanguage(), 'zh');
    assert.equal(localize('今天'), '今天');
  } finally { delete globalThis.window; delete globalThis.document; }
});
