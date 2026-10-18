import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const rule = selector => {
    const start = css.indexOf(`${selector} {`);
    assert.notEqual(start, -1, `Missing rule: ${selector}`);
    return css.slice(start, css.indexOf('}', start));
};

test('settings sidebar reserves one icon column and leading-aligns category labels', () => {
    const tab = rule('.ncl-settings .ncl-settings-tab');
    assert.match(tab, /grid-template-columns:\s*16px minmax\(0, 1fr\)/);
    assert.match(tab, /justify-content:\s*start/);
    assert.match(tab, /text-align:\s*start/);
});

test('compact category navigation overrides core end-aligned dropdown values', () => {
    const select = rule('.ncl-settings.is-narrow .ncl-settings-select');
    assert.match(select, /text-align:\s*start/);
    assert.match(select, /text-align-last:\s*start/);
    assert.match(select, /padding-inline:\s*12px 34px/);
    assert.match(select, /max-width:\s*100%/);
});
